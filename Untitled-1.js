// Importar funções do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// --- LÓGICA DO MENU HAMBÚRGUER (sem alterações) ---
document.querySelector('.hamburger-menu')?.addEventListener('click', function() {
    document.querySelector('.sidebar').classList.toggle('active');
});
document.addEventListener('click', function(event) {
    const sidebar = document.querySelector('.sidebar');
    const hamburger = document.querySelector('.hamburger-menu');
    if (!sidebar || !hamburger) return;
    const isClickInside = sidebar.contains(event.target);
    const isHamburger = hamburger.contains(event.target);
    if (!isClickInside && !isHamburger && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
});

// --- LÓGICA DE UID EFETIVO E CONTROLE DE ACESSO ---

// Armazena a promessa que resolverá para o UID efetivo
const effectiveUidPromise = new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDocRef = doc(db, "restaurantes", user.uid);
            try {
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    // Se for funcionário, usa o UID do dono. Senão, usa o próprio UID.
                    const effectiveUid = userData.restaurante_dono_uid || user.uid;
                    updateMenuItems(userData.plano); // Atualiza o menu com base no plano real
                    resolve(effectiveUid); // Resolve a promessa com o UID correto
                } else {
                     reject("Documento do usuário não encontrado.");
                }
            } catch (error) {
                reject(error);
            }
        } else {
            // Se não há usuário, redireciona para o login (exceto nas páginas de login/cadastro)
            const currentPage = window.location.pathname.split('/').pop();
            if (currentPage && !['index.html', 'cadastro.html'].includes(currentPage)) {
                window.location.href = 'index.html';
            }
            reject("Usuário não autenticado.");
        }
    });
});

// Exporta a função que retorna a promessa do UID
export async function getEffectiveUid() {
    return effectiveUidPromise;
}

// Função para buscar o plano do usuário (agora usada internamente)
async function getUserData(userId) {
    const userDocRef = doc(db, "restaurantes", userId);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
        return userDoc.data();
    }
    return null;
}

// Função para atualizar a aparência e o comportamento dos itens do menu
function updateMenuItems(plan) {
    const proFeatures = [{ href: 'relatorios.html', name: 'Relatórios' }];

    // Se o plano for 'funcionario', trata como 'pro' para visualização, pois ele tem acesso
    const displayPlan = (plan === 'funcionario') ? 'pro' : plan;

    if (displayPlan === 'free') {
        proFeatures.forEach(feature => {
            const menuItem = document.querySelector(`.menu-item[onclick*="${feature.href}"]`);
            if (menuItem) {
                menuItem.classList.add('locked');
                if (!menuItem.querySelector('.pro-badge')) {
                     menuItem.innerHTML += ' <span class="pro-badge">PRO</span>';
                }
                menuItem.onclick = (e) => {
                    e.preventDefault();
                    alert(`"${feature.name}" é uma funcionalidade do Plano Pro.`);
                    window.location.href = 'assinatura.html';
                };
            }
        });
    }

    // Adiciona o link "Assinatura" se for o dono da conta (free ou pro)
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && plan !== 'funcionario' && !document.querySelector('.menu-item[onclick*="assinatura.html"]')) {
        const sairButton = document.querySelector('.menu-item[onclick*="logout()"]');
        const assinaturaItem = document.createElement('div');
        assinaturaItem.className = 'menu-item';
        assinaturaItem.textContent = '⭐ Assinatura';
        assinaturaItem.onclick = () => { window.location.href = 'assinatura.html'; };
        if (sairButton) {
            sidebar.insertBefore(assinaturaItem, sairButton);
        }
    }
}

// Função de Logout
window.logout = function() {
    if (confirm("Você tem certeza que deseja sair?")) {
        signOut(auth).then(() => {
            window.location.href = "index.html";
        }).catch((error) => {
            console.error("Erro ao fazer logout:", error);
        });
    }
}
