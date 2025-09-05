# Branch Staff Directory

This is a web application designed to serve as a staff directory for a business with multiple branches. The application allows users to view staff information, and provides an admin interface for adding, editing, and deleting staff members and branches.

The unique aspect of this project is its architecture: it leverages a Google Sheet as a real-time database and a Google Apps Script as a serverless backend API. This allows for easy data management directly within a Google Sheet, without the need for a traditional backend server or database.

## 🚀 Live Demo

You can view a live demo of this application [here](https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/).

## 💻 Architecture Overview

The project is split into two main parts:

1.  **Frontend (Hosted on GitHub Pages):** This includes all the static files—HTML, CSS, and JavaScript. It's a single-page application that handles user interactions and displays data.
2.  **Backend (Google Apps Script):** This remains hosted on Google's servers. The Apps Script is deployed as a web app that acts as a JSON API, handling all `doGet` and `doPost` requests from the frontend. It reads from and writes to the Google Sheet.

The frontend communicates with the Apps Script API using standard `fetch` API calls, making it a powerful and efficient way to manage data.

## ⚙️ How to Set Up the Project

### Prerequisites

* A Google account with access to Google Sheets and Google Drive.
* A GitHub account.

### Step 1: Set Up the Google Apps Script Backend

1.  **Create a Google Sheet:** Create a new Google Sheet that will serve as your database. Make sure to name the first sheet 'Master' or a similar name to be used as a template for new branches.
2.  **Open Apps Script:** In the Google Sheet, go to `Extensions > Apps Script`.
3.  **Paste the Code:** Copy the code from the `Code.gs` file in this repository and paste it into the script editor.
4.  **Update the Spreadsheet ID:** Find the `SPREADSHEET_ID` constant at the top of the `Code.gs` file and replace the placeholder with the ID of your newly created Google Sheet.
5.  **Deploy as a Web App:**
    * Click on `Deploy > New deployment`.
    * Select `Web app` as the type.
    * Set `Execute as` to **Me**.
    * Set `Who has access` to **Anyone**.
    * Click **Deploy** and authorize the script.
6.  **Copy the Web App URL:** After deployment, Google will provide you with a Web App URL. **Copy this URL** as you will need it for the next step.

### Step 2: Configure the Frontend

1.  **Open `JavaScript.html`:** In this repository's code, open the `JavaScript.html` file.
2.  **Paste the URL:** Find the `SCRIPT_URL` constant at the top of the file and paste the Web App URL you copied from the previous step.
3.  **Save the file.**

### Step 3: Push to GitHub and Deploy

1.  **Clone the Repository:** Clone this repository to your local machine.
2.  **Commit Your Changes:** Commit the change you made to the `JavaScript.html` file.
3.  **Push to GitHub:** Push your updated code to your GitHub repository.
4.  **Enable GitHub Pages:**
    * Go to your repository on GitHub.
    * Click on **Settings > Pages**.
    * Select the branch (`main` or `master`) and the folder (`/` or `root`) where your files are located.
    * Click **Save**. Your site will be live in a few minutes!

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/issues) for any open issues or to create a new one.
