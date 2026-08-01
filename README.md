# Isazi - Job Posting Fraud Detector

Isazi is an AI-powered job posting fraud detection app and media literacy tool for South African job seekers.

---

## ⚡ How to Run the App (Quick Steps)

### Step 1: Install Dependencies
Open your terminal in the project folder and run:
```bash
npm install
```

### Step 2: Start the Server
Run the development command:
```bash
npm run dev
```

### Step 3: Open in Browser
Open your web browser and go to:
```
http://localhost:3000
```

---

## 🛠️ Additional Commands

- **Run in Production Mode**:
  ```bash
  npm run build
  npm run start
  ```
- **Check for Code Errors**:
  ```bash
  npm run lint
  ```

---

## 🧩 How to Install the Chrome Extension

1. Open Google Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/` folder inside this project directory.
5. Click the **Isazi** icon in your browser toolbar to scan job postings!

---

## 📡 API Endpoints

- **Health Check**: `GET http://localhost:3000/api/health`
- **Score Job Posting**: `POST http://localhost:3000/api/score`
  - **Body**: `{"text": "Job text here..."}`

