# 💬 What Did I Miss?

**What Did I Miss?** is a powerful, privacy-first web application designed to analyze your WhatsApp chat exports entirely on your device. It instantly cuts through the noise of hundreds of messages to find exactly what matters: critical updates, important dates, action items, and personal mentions.

Built with **React**, **Vite**, and **Tailwind CSS v4**, this tool was designed with a sleek, 3D-beveled dark mode UI to make reviewing long conversations effortless.

![Dashboard Preview](https://via.placeholder.com/1000x500.png?text=What+Did+I+Miss+-+Dashboard)

## ✨ Features

- 🔒 **100% On-Device Privacy:** Your chat data never leaves your browser. All parsing and analysis is done locally using a custom heuristic engine.
- 📅 **Date Range Filtering:** Focus your analysis by optionally selecting a start and end date.
- 🎯 **Smart Extraction:** Automatically identifies:
  - **Important Messages:** High-priority updates, decisions, and action items.
  - **Dates & Events:** Next meeting times and upcoming deadlines.
  - **Mentions:** Tracks where your name, aliases, or phone number were mentioned.
- ✅ **Task Management:** Mark extracted messages and action items as "Done" to clear them from your dashboard.
- 🎨 **Premium UI/UX:** A custom 3D dark-mode aesthetic with interactive hanging stat cards, a sticky sidebar, and fully responsive layouts.
- 👤 **Seamless Account Switching:** Mocked Google OAuth flow for secure, distinct user sessions.

## 🚀 Getting Started

### Prerequisites
Make sure you have Node.js (v18+) and npm installed on your machine.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Divyansh-Singh-1/PALS_85.git
   cd PALS_85/what-did-i-miss
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open in Browser:**
   Navigate to `http://localhost:5173` in your web browser.

## 📱 How to Use

1. **Export your Chat:** On your phone, go to any WhatsApp group or chat, tap Options > More > Export Chat (Without Media). Save the `.txt` file to your computer.
2. **Sign In:** Click "Sign in with Google" and select a profile.
3. **Upload & Configure:** Upload your WhatsApp `.txt` file. Enter any aliases or phone numbers your friends use to refer to you, and optionally set a date range.
4. **Analyze:** Click "Analyze" and explore your personalized dashboard!

## 🛠 Tech Stack

- **Frontend Framework:** React 18
- **Build Tool:** Vite
- **Styling:** Tailwind CSS v4
- **Icons:** Lucide React
- **Language:** TypeScript
- **State Management:** React Hooks

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📝 License
This project is open-source and available under the [MIT License](LICENSE).
