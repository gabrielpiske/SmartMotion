# SmartDrive Multispeed — Web App

Aplicação web mobile-first para controle multivelocidade de motor trifásico via Inversor de Frequência, desenvolvida para o **Mundo Senai (SENAI Timbó)** pelos alunos de Aprendizagem Industrial de Eletrônico de Manutenção Industrial.

---

## 🚀 Como Rodar Localmente

### 1. Pré-requisitos
- Node.js 18+ instalado
- Um projeto criado no [Firebase Console](https://console.firebase.google.com/) com o **Realtime Database** ativado.

### 2. Configurar o Firebase
Copie o arquivo de exemplo e preencha com as credenciais do seu projeto Firebase:

```bash
cp .env.local.example .env.local
```

Edite o `.env.local` com os valores do Firebase Console:
- Acesse **Project Settings** > **General** > **Your apps** > **Web app**.
- Copie o `firebaseConfig` para as variáveis do `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://seu-projeto-default-rtdb.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=seu-projeto
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=seu-projeto.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
```

### 3. Regras do Firebase Realtime Database
Para testes durante a feira, use as regras de leitura/escrita aberta (ou autenticação anônima):

```json
{
  "rules": {
    "motorControl": {
      ".read": true,
      ".write": true
    }
  }
}
```

### 4. Executar em Desenvolvimento
```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador (ou pelo IP da rede local no celular).

---

## 🌐 Deploy na Vercel

1. Suba o repositório para o GitHub.
2. Acesse a [Vercel](https://vercel.com/) e importe o repositório.
3. Defina o **Root Directory** como `web_app`.
4. Em **Environment Variables**, adicione todas as variáveis do `.env.local`.
5. Clique em **Deploy**!

---

## 📱 Estrutura do App

- **`src/app/page.tsx`**: Interface mobile-first para os visitantes controlarem o motor pelo celular via QR Code.
- **`src/app/dashboard-bancada/page.tsx`**: Painel administrativo/quiosque que fica aberto no notebook conectado ao Arduino via USB:
  - **Ponte Web Serial:** Conecta diretamente ao Arduino a 115200 baud pelo navegador.
  - **Sincronização Firebase:** Escuta `/motorControl/command` e grava a resposta do Arduino em `/motorControl/status`.
  - **QR Code Interativo:** Gera um QR Code de alto contraste apontando para a interface mobile para os visitantes assumirem o controle.
  - **Terminal Serial & Telemetria:** Exibe os estados dos 4 relés, velocidade real, botão de tela cheia e console de logs em tempo real.
- **`src/components/SpeedControl.tsx`**: 4 botões de velocidade (Parado, Baixa, Média, Alta) com feedback visual ativo.
- **`src/components/RelayDashboard.tsx`**: Dashboard animado com simulação de 4 relés (LEDs ON/OFF e fluxo para DI do Inversor).
- **`src/components/EmergencyButton.tsx`**: Botão de parada imediata com confirmação em duas etapas para reset.
- **`src/components/ConnectionStatus.tsx`**: Indicador visual do status de conexão com o Firebase.
- **`src/hooks/useWebSerial.ts`**: Hook reutilizável da Web Serial API com tratamento de desconexão, buffering por quebra de linha (`\n`) e watchdog de segurança.
- **`src/hooks/useMotorControl.ts`**: Hook de sincronização em tempo real via Firebase Realtime Database (`/motorControl/command` e `/motorControl/status`).

---

## 🎪 Fluxo de Uso na Feira

1. Conecte o Arduino Uno via cabo USB ao notebook da bancada.
2. Abra o Chrome/Edge no notebook e acesse a rota `/dashboard-bancada`.
3. Clique em **"Conectar Arduino (USB)"** e selecione a porta serial do Arduino.
4. Clique no botão de **Tela Cheia** para exibir o QR Code em destaque.
5. Os visitantes apontam a câmera do celular para o QR Code e acessam a interface `/`.
6. Quando o visitante aperta qualquer velocidade ou emergência:
   `Celular (Visitante) → Firebase Realtime DB → Notebook (/dashboard-bancada) → Web Serial (115200 baud) → Arduino Uno → Relés (Active LOW) → Inversor de Frequência`
7. A telemetria de retorno do Arduino (`STATUS:...`) é enviada de volta ao Firebase, sincronizando todos os celulares em tempo real!
