# Deploying LinkedIn Form Server to Render

This guide provides step-by-step instructions for deploying the LinkedIn Form Server to Render.

## Prerequisites

1. A [Render](https://render.com/) account
2. Your GitHub repository connected to Render
3. MongoDB Atlas database already set up

## Deployment Steps

### 1. Push Your Code to GitHub

Ensure your latest code is pushed to your GitHub repository.

### 2. Create a New Web Service on Render

1. Log in to your Render account
2. Click on **New** and select **Blueprint**
3. Connect your GitHub repository if you haven't already
4. Select the repository containing your server code
5. Render will automatically detect the `render.yaml` file and configure your service

### 3. Review and Apply Configuration

1. Review the configuration settings that Render has detected from your `render.yaml` file
2. Ensure all environment variables are correctly set:
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `ALLOWED_ORIGINS`: Your frontend URL (Firebase)
   - `JWT_SECRET`: Your secure JWT secret key
   - Other environment variables as needed
3. Click **Apply** to start the deployment

### 4. Monitor Deployment

1. Render will start building and deploying your application
2. You can monitor the build logs in real-time
3. Once deployment is complete, Render will provide a URL for your service

### 5. Verify Deployment

1. Test the health endpoint: `https://your-service-url.onrender.com/api/health`
2. Ensure your frontend can connect to the deployed backend

## Troubleshooting

### Common Issues

1. **Build Failures**: Check the build logs for errors. Common issues include missing dependencies or build script errors.
2. **Connection Issues**: Ensure your MongoDB Atlas IP whitelist includes Render's IP addresses or is set to allow connections from anywhere.
3. **CORS Errors**: Verify that the `ALLOWED_ORIGINS` environment variable is correctly set to your frontend URL.

### Logs and Monitoring

- Access logs from your Render dashboard
- Set up alerts for service downtime or errors

## Updating Your Deployment

When you push changes to your GitHub repository, Render will automatically rebuild and redeploy your application if you've enabled automatic deployments.

## Additional Resources

- [Render Documentation](https://render.com/docs)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)