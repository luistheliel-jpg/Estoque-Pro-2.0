const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

admin.initializeApp({
    projectId: "controle-de-estoque-fac87"
});
const db = admin.firestore();

setGlobalOptions({ invoker: "public" });

const corsOrigins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://controle-de-estoque-fac87.web.app",
    "https://controle-de-estoque-fac87.firebaseapp.com",
    "https://luistheliel-jpg.github.io"
];

// ─── 1. Cria sessão de checkout no Stripe ───────────────────────────────────
exports.createCheckoutSession = onCall({ cors: corsOrigins }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const uid = request.auth.uid;
    const data = request.data;
    console.log("createCheckoutSession chamado para uid:", uid);

    let userDoc;
    try {
        userDoc = await db.collection("restaurantes").doc(uid).get();
    } catch (e) {
        console.error("Erro ao buscar Firestore:", e);
        throw new HttpsError("internal", "Erro ao buscar usuário.");
    }

    console.log("Documento existe:", userDoc.exists);

    if (!userDoc.exists) {
        throw new HttpsError("not-found", "Usuário não encontrado.");
    }

    const userData = userDoc.data();
    let customerId = userData.stripeCustomerId;

    if (!customerId) {
        const customer = await stripe.customers.create({
            email: userData.email,
            metadata: { firebaseUid: uid }
        });
        customerId = customer.id;
        await db.collection("restaurantes").doc(uid).update({ stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [{
            price: process.env.STRIPE_PRICE_ID,
            quantity: 1
        }],
        success_url: `${data.baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${data.baseUrl}/cancel.html`,
        metadata: { firebaseUid: uid }
    });

    return { url: session.url };
});

// ─── 2. Abre o Portal de Cobrança do Stripe ─────────────────────────────────
exports.createPortalSession = onCall({ cors: corsOrigins }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }

    const data = request.data;
    const checkoutSession = await stripe.checkout.sessions.retrieve(data.sessionId);

    const portalSession = await stripe.billingPortal.sessions.create({
        customer: checkoutSession.customer,
        return_url: data.returnUrl
    });

    return { url: portalSession.url };
});

// ─── 3. Webhook do Stripe — libera/revoga o plano pro ───────────────────────
exports.stripeWebhook = onRequest(async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
        console.error("Webhook signature inválida:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const session = event.data.object;

    if (event.type === "checkout.session.completed") {
        const uid = session.metadata?.firebaseUid;
        if (uid) {
            await db.collection("restaurantes").doc(uid).update({
                plano: "pro",
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
                trialExpira: admin.firestore.FieldValue.delete()
            });
            console.log(`Plano pro ativado para uid: ${uid}`);
        }
    }

    if (event.type === "customer.subscription.updated") {
        console.log(`Subscription updated: ${event.id}`);
    }

    if (event.type === "customer.subscription.created") {
        console.log(`Subscription created: ${event.id}`);
    }

    if (event.type === "customer.subscription.trial_will_end") {
        console.log(`Subscription trial will end: ${event.id}`);
    }

    if (event.type === "entitlements.active_entitlement_summary.updated") {
        console.log(`Active entitlement summary updated: ${event.id}`);
    }

    if (event.type === "customer.subscription.deleted") {
        const customerId = session.customer;
        const snap = await db.collection("restaurantes")
            .where("stripeCustomerId", "==", customerId)
            .limit(1)
            .get();
        if (!snap.empty) {
            await snap.docs[0].ref.update({
                plano: "free",
                stripeSubscriptionId: admin.firestore.FieldValue.delete()
            });
            console.log(`Plano revertido para free: ${snap.docs[0].id}`);
        }
    }

    res.status(200).send("ok");
});
