// Importar funções do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, arrayUnion, arrayRemove, deleteField } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCkwsmbR683PMT1XoOyEykqJmLCcieQwwU",
    authDomain: "controle-de-estoque-fac87.firebaseapp.com",
    projectId: "controle-de-estoque-fac87",
    storageBucket: "controle-de-estoque-fac87.firebasestorage.app",
    messagingSenderId: "931385340836",
    appId: "1:931385340836:web:ed3cb1d560127b739b8731"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const container = document.getElementById('subscription-container');
let currentUser = null;
let currentUserData = null;

// --- RENDERIZAÇÃO DAS VIEWS ---

function renderFreeView() {
    container.innerHTML = `
        <div class="card">
            <h2>Mude para o Plano Pro e Desbloqueie Todo o Potencial!</h2>
            <p>Tenha acesso a relatórios avançados, gráficos, insights de IA e adicione sua equipe.</p>
            <ul class="pro-features">
                <li>Relatórios Avançados e Gráficos</li>
                <li>Até 4 contas de funcionário</li>
                <li>Insights com Inteligência Artificial</li>
            </ul>
            <button id="upgrade-btn" class="btn btn-primary">Fazer Upgrade por R$ 99,90/mês</button>
        </div>
        ${renderHelpSection()}
    `;
    document.getElementById('upgrade-btn').addEventListener('click', upgradeToPro);
}

function renderProView(userData) {
    container.innerHTML = `
        <div class="card">
            <h2>Você é um Assinante Pro!</h2>
            <p>Gerencie sua assinatura e sua equipe.</p>
            <button id="cancel-btn" class="btn btn-danger">Cancelar Assinatura</button>
        </div>
        <div class="card">
            <h2>Gerenciar Equipe</h2>
            <p>Você pode adicionar até 4 funcionários. Peça para eles se cadastrarem com o e-mail convidado.</p>
            <div id="invite-form">
                <input type="email" id="employee-email" placeholder="E-mail do funcionário">
                <button id="invite-btn" class="btn btn-primary">Convidar</button>
            </div>
            <h4>Sua Equipe:</h4>
            <ul id="employee-list">Carregando equipe...</ul>
        </div>
        ${renderHelpSection()}
    `;
    document.getElementById('cancel-btn').addEventListener('click', downgradeToFree);
    document.getElementById('invite-btn').addEventListener('click', inviteEmployee);
    loadEmployees(userData);
}

function renderTrialView(userData) {
    const trialExpira = new Date(userData.trialExpira);
    const agora = new Date();
    const diffMs = trialExpira - agora;
    const diasRestantes = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    container.innerHTML = `
        <div class="card">
            <h2>Seu Trial Pro está ativo!</h2>
            <p>Você tem <strong>${diasRestantes} dia(s)</strong> restante(s) de acesso gratuito ao Plano Pro.</p>
            <p>Ao final do período, suas funcionalidades Pro serão bloqueadas. Assine agora para continuar sem interrupção.</p>
            <ul class="pro-features">
                <li>Relatórios Avançados e Gráficos</li>
                <li>Até 4 contas de funcionário</li>
                <li>Insights com Inteligência Artificial</li>
            </ul>
            <button id="upgrade-btn" class="btn btn-primary">Assinar Pro por R$ 99,90/mês</button>
        </div>
        ${renderHelpSection()}
    `;
    document.getElementById('upgrade-btn').addEventListener('click', upgradeToPro);
}

function renderTrialExpiredView() {
    container.innerHTML = `
        <div class="card">
            <h2>Seu período de teste encerrou</h2>
            <p>Esperamos que tenha aproveitado os 7 dias grátis do Plano Pro! Assine agora para continuar com acesso completo.</p>
            <ul class="pro-features">
                <li>Relatórios Avançados e Gráficos</li>
                <li>Até 4 contas de funcionário</li>
                <li>Insights com Inteligência Artificial</li>
            </ul>
            <button id="upgrade-btn" class="btn btn-primary">Assinar Pro por R$ 99,90/mês</button>
        </div>
        ${renderHelpSection()}
    `;
    document.getElementById('upgrade-btn').addEventListener('click', upgradeToPro);
}


function renderHelpSection() {
    return `
        <div class="card">
            <h2>Precisa de Ajuda?</h2>
            <p>E-mail: <a href="mailto:suporte@estoquepro.com">suporte@estoquepro.com</a> | WhatsApp: <a href="https://wa.me/5511999999999" target="_blank">+55 11 99999-9999</a></p>
        </div>
    `;
}


// --- LÓGICA DE GERENCIAMENTO DE EQUIPE ---

async function loadEmployees(userData) {
    const list = document.getElementById('employee-list');
    list.innerHTML = '';
    const employeeUids = userData.funcionarios || [];

    if (employeeUids.length === 0) {
        list.innerHTML = '<li>Nenhum funcionário adicionado.</li>';
        return;
    }

    for (const uid of employeeUids) {
        const userDoc = await getDoc(doc(db, "restaurantes", uid));
        if (userDoc.exists()) {
            const employeeData = userDoc.data();
            const li = document.createElement('li');
            li.textContent = `${employeeData.nome} (${employeeData.email})`;
            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'Remover';
            removeBtn.className = 'btn-remove';
            removeBtn.onclick = () => removeEmployee(uid);
            li.appendChild(removeBtn);
            list.appendChild(li);
        }
    }
}

async function inviteEmployee() {
    const email = document.getElementById('employee-email').value.trim();
    if (!email) {
        alert("Por favor, insira um e-mail.");
        return;
    }

    const currentEmployees = currentUserData.funcionarios || [];
    if (currentEmployees.length >= 4) {
        alert("Você atingiu o limite de 4 funcionários.");
        return;
    }

    // Verificar se o convite já existe
    const q = query(collection(db, "convites"), where("email_convidado", "==", email), where("dono_uid", "==", currentUser.uid));
    const existingInvites = await getDocs(q);
    if (!existingInvites.empty) {
        alert("Este e-mail já foi convidado.");
        return;
    }

    try {
        await addDoc(collection(db, "convites"), {
            dono_uid: currentUser.uid,
            email_convidado: email,
            status: 'pendente',
            dataConvite: new Date().toISOString()
        });
        alert(`Convite enviado para ${email}. Peça para que se cadastrem com este e-mail.`);
        document.getElementById('employee-email').value = '';
    } catch (error) {
        console.error("Erro ao enviar convite: ", error);
        alert("Não foi possível enviar o convite.");
    }
}

async function removeEmployee(employeeUid) {
    if (!confirm("Tem certeza que deseja remover este funcionário? Ele perderá o acesso aos dados do seu restaurante.")) return;

    try {
        // Remover do array do dono
        await updateDoc(doc(db, "restaurantes", currentUser.uid), {
            funcionarios: arrayRemove(employeeUid)
        });

        // Remover vínculo do documento do funcionário
        const employeeDocRef = doc(db, "restaurantes", employeeUid);
        await updateDoc(employeeDocRef, {
            plano: 'free', // Reverte para free
            restaurante_dono_uid: null // Ou delete a field
        });

        alert("Funcionário removido com sucesso.");
        window.location.reload();
    } catch (error) {
        console.error("Erro ao remover funcionário:", error);
        alert("Não foi possível remover o funcionário.");
    }
}


// --- LÓGICA DE ATUALIZAÇÃO DO PLANO ---

async function upgradeToPro() {
    window.location.href = "checkout.html";
}

async function downgradeToFree() {
    if (!currentUser) return;
    if (confirm("Tem certeza que deseja cancelar sua assinatura Pro?")) {
        try {
            await updateDoc(doc(db, "restaurantes", currentUser.uid), { plano: "free" });
            alert("Sua assinatura foi cancelada.");
            window.location.reload();
        } catch (error) {
            console.error("Erro ao fazer downgrade:", error);
        }
    }
}


// --- INICIALIZAÇÃO ---

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;

        const params = new URLSearchParams(window.location.search);
        if (params.get("status") === "success") {
            container.innerHTML = `<div class="card"><h2>Pagamento confirmado!</h2><p>Seu plano Pro está sendo ativado. Aguarde um instante...</p></div>`;
            setTimeout(() => window.location.replace("assinatura.html"), 4000);
            return;
        }
        if (params.get("status") === "cancelled") {
            history.replaceState(null, "", "assinatura.html");
        }

        const userDocRef = doc(db, "restaurantes", user.uid);
        try {
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                currentUserData = userDoc.data();
                if (currentUserData.plano === 'pro') {
                    renderProView(currentUserData);
                } else if (currentUserData.plano === 'trial') {
                    const trialExpira = currentUserData.trialExpira ? new Date(currentUserData.trialExpira) : null;
                    if (trialExpira && new Date() <= trialExpira) {
                        renderTrialView(currentUserData);
                    } else {
                        renderTrialExpiredView();
                    }
                } else if (currentUserData.plano === 'free') {
                    renderFreeView();
                } else {
                    // É um funcionário, redirecionar para o dashboard
                    container.innerHTML = '<h2>Bem-vindo!</h2><p>Você está logado como funcionário. Redirecionando para o dashboard...</p>';
                    setTimeout(() => { window.location.href = 'dashboard.html'; }, 2000);
                }
            } else {
                renderFreeView();
            }
        } catch (error) {
            console.error("Erro ao buscar dados do usuário:", error);
            container.innerHTML = "<p>Ocorreu um erro ao carregar suas informações.</p>";
        }
    } else {
        window.location.href = 'index.html';
    }
});
