# LinkedIn Form Server - Render Deployment Steps

## Prerequisites

1. A [Render account](https://render.com/)
2. A GitHub account
3. Git installed on your local machine (already done)

## Step 1: Prepare Your Code for GitHub

### 1.1 Remove Sensitive Files

Before pushing to GitHub, you need to remove sensitive files and credentials:

1. Make sure the `.gitignore` file includes these entries:
   ```
   # Sensitive credentials
   linked-in-form-89014-firebase-adminsdk-fbsvc-f6d9077faf.json
   config/google-credentials.json
   .env
   ```

2. If you've already committed these files, remove them from git tracking:
   ```
   git rm --cached linked-in-form-89014-firebase-adminsdk-fbsvc-f6d9077faf.json
   git rm --cached config/google-credentials.json
   git rm --cached .env
   git commit -m "Remove sensitive files from git tracking"
   ```

### 1.2 Push Your Code to GitHub

1. Create a new repository on GitHub (https://github.com/new)
2. Copy the repository URL (e.g., `https://github.com/yourusername/linkedinform-server.git`)
3. Run these commands in your terminal:
   ```
   git remote add origin https://github.com/Thanush2412/linkedinform-server.git
   git branch -M main
   git push -u origin main
   ```

## Step 2: Deploy to Render using Blueprint

1. Log in to your [Render dashboard](https://dashboard.render.com)
2. Go to the "Blueprints" section
3. Click "New Blueprint Instance"
4. Connect your GitHub account if you haven't already
5. Select the repository containing your server code

## Step 3: Configure Your Blueprint

Render will automatically detect the `render.yaml` file in your repository and use it to configure your service.

1. Review the configuration settings
2. Your `render.yaml` file already contains these environment variables:
   - `NODE_ENV`: Set to "production"
   - `PORT`: Set to 5000
   - `HOST`: Set to 0.0.0.0
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `ALLOWED_ORIGINS`: Your Firebase frontend URL (https://linked-in-form-89014.web.app)
   - `JWT_SECRET`: A secure JWT secret key
   - `API_PREFIX`: Set to "/api"
   - `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD`: Credentials for the default admin user
   - `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD`: Credentials for the superadmin user
   - `GOOGLE_CLIENT_ID` and `GOOGLE_MAPS_API_KEY`: Google API credentials
3. Click "Apply" to start the deployment process

## Step 4: Monitor the Deployment

1. Render will start building and deploying your application
2. You can monitor the build logs in real-time from the Render dashboard
3. The initial build may take a few minutes to complete

## Step 5: Verify the Deployment

Once the deployment is complete:

1. Render will provide a URL for your service (e.g., `https://linkedinform-server.onrender.com`)
2. Test the health endpoint: `https://linkedinform-server.onrender.com/api/health`
3. You should receive a JSON response with status "healthy"

## Step 6: Update Your Frontend Configuration

Ensure your frontend application is configured to use the new Render URL for API requests if needed.

## Troubleshooting

### Common Issues

1. **Connection Errors**: If your application can't connect to MongoDB, check that your MongoDB Atlas connection string is correct and that your IP whitelist includes Render's IPs or is set to allow connections from anywhere (0.0.0.0/0).

2. **CORS Errors**: If you're experiencing CORS issues, verify that the `ALLOWED_ORIGINS` environment variable is correctly set to your frontend URL.

3. **Build Failures**: Check the build logs for any errors. Common issues include missing dependencies or syntax errors.

### Logs and Debugging

- Access logs from your Render dashboard under the "Logs" tab
- For more detailed debugging, you can add additional console.log statements to your code and redeploy

## Updating Your Deployment

When you push changes to your GitHub repository:

1. Render will automatically rebuild and redeploy your application if you've enabled automatic deployments
2. You can also manually trigger a deploy from the Render dashboard