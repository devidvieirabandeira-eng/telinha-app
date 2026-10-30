<p align="center"><img src="capa.jpg" alt="Telinha" width="720"></p>

# Telinha para Windows

Transmita o seu jogo para os amigos, **com o som só do jogo** (sem o Discord vazando na live) e sem a borda amarela do Windows. Quem assiste não precisa instalar nada: entra pelo navegador, no mesmo link.

### ⬇️ [Baixar o Telinha para Windows](https://github.com/devidvieirabandeira-eng/telinha-app/releases/latest/download/Telinha-Setup.exe)

Windows 10 (versão 2004 ou mais nova) ou Windows 11, 64 bits.

---

## ⚠️ O Windows vai dizer que o app "não é confiável". É normal, e aqui está o porquê

Na primeira vez que você abrir o instalador, vai aparecer uma tela azul assim:

> **O Windows protegeu o computador**
> O Microsoft Defender SmartScreen impediu a inicialização de um aplicativo não reconhecido.

**Por que isso acontece:** para o Windows reconhecer um programa como "confiável", o autor precisa comprar um **certificado de assinatura de código**, que custa de US$ 200 a US$ 400 **por ano**, e o programa precisa ser baixado por muita gente até ganhar reputação. O Telinha é um projeto feito para um grupo de amigos e não tem esse certificado. O aviso aparece para **qualquer** programa sem certificado, não porque foi encontrado algo de errado nele.

**Para instalar mesmo assim:**

1. Clique em **Mais informações**.
2. Clique em **Executar assim mesmo**.

Pronto. O app instala sozinho, sem pedir senha de administrador, e abre.

---

## 🔍 Por que dá para confiar (e como conferir você mesmo)

Não precisa acreditar na nossa palavra. Dá para conferir:

### 1. O código está todo aqui, aberto

Tudo o que o app faz está na pasta [`app/`](app/). São poucos arquivos e dá para ler em minutos. O principal é o [`app/main.js`](app/main.js). Em resumo, o app:

- **abre o site do Telinha** (`telinha.devid-vieirabandeira.workers.dev`) numa janela, e mais nada. Qualquer outro link abre no seu navegador normal;
- **mostra um seletor de tela** quando você clica em "Compartilhar tela", para você escolher o jogo;
- **captura o som** do programa que você escolher (ou do computador todo, se preferir);
- **fica na bandeja** (perto do relógio) quando você clica no X, para a live não cair.

### 2. O que o app **não** faz

- Não lê nem mexe nos seus arquivos.
- Não liga o microfone nem a câmera.
- Não pede permissão de administrador: instala só na sua pasta de usuário.
- Não abre sozinho quando o Windows liga.
- Não transmite nada sem você clicar em "Compartilhar tela" e escolher o que vai aparecer.

### 3. Confira se o arquivo é o mesmo que foi publicado

Cada versão tem uma "impressão digital" (SHA-256). Se alguém alterasse o instalador, ela mudaria. Para conferir, abra o **PowerShell** na pasta onde baixou e rode:

```powershell
Get-FileHash .\Telinha-Setup.exe
```

O resultado tem que ser igual ao da tabela:

| Versão | SHA-256 do `Telinha-Setup.exe` |
| --- | --- |
| 1.1.0 | `585d9caba71d6e7ce99f17c59eba98c754694e1054e5ffd6287955fc46b2a7ae` |

### 4. Passe no antivírus antes de instalar

Você pode enviar o instalador para o [VirusTotal](https://www.virustotal.com/), que verifica o arquivo em mais de 60 antivírus de uma vez. Ou clique com o botão direito no arquivo e escolha **Verificar com o Microsoft Defender**.

### 5. A peça de terceiros, explicada

Para pegar **só o som do jogo**, o app usa dois executáveis pequenos do projeto de código aberto [application-loopback](https://github.com/WerdoxDev/application-loopback) (licença MIT), baseados num [exemplo oficial da Microsoft](https://github.com/microsoft/Windows-classic-samples/tree/main/Samples/ApplicationLoopback). Eles só usam as funções de áudio do Windows e a lista de janelas abertas: não acessam a internet, os arquivos nem o registro do Windows. Junto vão as bibliotecas do Visual C++ da Microsoft de que eles precisam.

---

## 🎮 Como usar

1. Abra o Telinha e clique em **Criar uma sala**, ou cole o link que um amigo mandou em **"Já tem um link? Cole aqui"**.
2. Clique em **Compartilhar tela**. No seletor:
   - **Aba Telas + "Só o som de um app" + o seu jogo:** é a melhor opção. A tela vai sem a borda amarela e o som vai só do jogo.
   - **Aba Janelas:** transmite só a janela do jogo, com o som só dele. Nesse modo o Windows mostra uma borda amarela em volta da janela, mas **só você vê**, ela não aparece na live.
3. Mande o link da sala para a galera. Eles assistem pelo navegador, sem instalar nada.
4. Pode clicar no **X**: o Telinha vai para a bandeja (perto do relógio) e a transmissão continua. Para fechar de vez: botão direito no ícone e depois **Sair**.

**Leve para jogar:** enquanto você transmite, o app não fica mostrando a sua própria tela (isso pesaria). Se quiser conferir como está saindo, clique em **Assistir minha transmissão**.

## 🔄 Atualizações

O app abre o site do Telinha, então **quase tudo atualiza sozinho**, sem reinstalar. Só quando mudar algo do próprio app (por exemplo, o seletor de tela) vai sair uma versão nova aqui.

## 🧹 Desinstalar

**Configurações → Aplicativos → Telinha → Desinstalar.**

## 🛠️ Compilar você mesmo

Se preferir não usar o instalador pronto, dá para gerar o seu a partir do código desta página (precisa do [Node.js](https://nodejs.org/) 22 ou mais novo):

```bash
cd app
npm install
npm run dist
```

O instalador sai em `app/dist/Telinha-Setup.exe`.
