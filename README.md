# Google Drive Folder Link

An Obsidian plugin that lets you attach a Google Drive folder to a note via fuzzy search. Search across configured root folders in My Drive and Shared Drives, and access linked folders with one click from the note's properties pane.

![Google Drive Folder Link Plugin for Obsidian](./docs/project.jpg)

## Features

- Fuzzy search across Google Drive folders within configured root folders
- Supports both My Drive and Shared Drives
- Folder association stored in note frontmatter
- Clickable link in the Properties pane to open the folder in your browser
- Command palette and context menu integration

## Setup

### 1. Create Google Cloud OAuth Credentials

This plugin requires each user to create their own Google Cloud OAuth credentials.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Google Drive API**:
   - Navigate to **APIs & Services > Library**
   - Search for "Google Drive API" and click **Enable**
4. Configure the **OAuth consent screen** (you must do this before creating credentials):
   - Navigate to **APIs & Services > OAuth consent screen**
   - **If you are using a Google Workspace account:** Select **Internal** as the app type. This makes the app available to users within your organization without further review.
   - **If you are using a personal Gmail account:** Select **External** as the app type. The app will be created in "Testing" mode. You must add your own Gmail address as a test user under **OAuth consent screen > Test users** so that you can authorize the app. This avoids needing to go through Google's verification process.
   - Fill in the required fields (App name, User support email, Developer contact email). The values are only for your own reference.
   - On the **Data access** (or **Scopes**) screen, click **Add or Remove Scopes**, search for `Google Drive API`, and select `.../auth/drive.readonly` ("See and download all your Google Drive files"). Click **Update** to confirm, then save.
   - Complete the remaining steps and save.
5. Create OAuth 2.0 credentials:
   - Navigate to **APIs & Services > Credentials**
   - Click **Create Credentials > OAuth client ID**
   - Application type: **Desktop app**
   - Give it a name (e.g., "Obsidian Drive Link")
   - Click **Create**
6. Copy the **Client ID** and **Client Secret**

### 2. Configure the Plugin

1. Install and enable the plugin in Obsidian
2. Open **Settings > Google Drive Folder Link**
3. Paste your Client ID and Client Secret
4. Click **Connect** and authorize access in your browser
5. Add one or more root folders to search within using **Add root folder**

### 3. Usage

- **Attach a folder:** Open a note, then use the command palette ("Attach Google Drive folder...") or right-click the file and select "Attach Google Drive folder..."
- **Open an attached folder:** Click the link in the Properties pane, use the command palette ("Open attached Google Drive folder"), or right-click the file
- **Remove a link:** Delete the `googleDriveFolderId` and `googleDriveFolderName` properties from the note

## Development

```bash
npm install
npm run dev
```
