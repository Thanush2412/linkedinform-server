# LinkedIn Form Server - Render Deployment Guide

## Overview

This guide provides detailed instructions for deploying the LinkedIn Form Server to Render.com using the included `render.yaml` blueprint file.

## Prerequisites

1. A [Render account](https://render.com/)
2. Your code pushed to a GitHub repository
3. MongoDB Atlas database already set up and configured

## Deployment Steps

### 1. Connect Your GitHub Repository to Render

1. Log in to your Render dashboard
2. Go to the "Blueprints" section
3. Click "New Blueprint Instance"
4. Connect your GitHub account if you haven't already
5. Select the repository containing your server code

### 2. Configure Your Blueprint

Render will automatically detect the `render.yaml` file in your repository and use it to configure your service.

1. Review the configuration settings
2. The following environment variables are already configured in the `render.yaml` file:
   - `NODE_ENV`: Set to "production"
   - `PORT`: Set to 5000
   - `HOST`: Set to 0.0.0.0
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `ALLOWED_ORIGINS`: Your Firebase frontend URL
   - `JWT_SECRET`: A secure JWT secret key
   - `API_PREFIX`: Set to "/api"
   - `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD`: Credentials for the default admin user
   - `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD`: Credentials for the superadmin user
   - `GOOGLE_CLIENT_ID` and `GOOGLE_MAPS_API_KEY`: Google API credentials

3. Click "Apply" to start the deployment process

### 3. Monitor the Deployment

1. Render will start building and deploying your application
2. You can monitor the build logs in real-time from the Render dashboard
3. The initial build may take a few minutes to complete

### 4. Verify the Deployment

Once the deployment is complete:

1. Render will provide a URL for your service (e.g., `https://linkedinform-server.onrender.com`)
2. Test the health endpoint: `https://linkedinform-server.onrender.com/api/health`
3. You should receive a JSON response with status "healthy"

### 5. Update Your Frontend Configuration

Ensure your frontend application is configured to use the new Render URL for API requests.

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

## Additional Resources

- [Render Documentation](https://render.com/docs)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Express.js Documentation](https://expressjs.com/)

## Security Considerations

- The JWT secret key is stored in the `render.yaml` file. For additional security, consider using Render's environment variable secrets feature for sensitive information.
- Regularly rotate your MongoDB Atlas password and update the connection string in Render accordingly.
- Monitor your application logs for any suspicious activity.

## Support

If you encounter any issues with your deployment, refer to the Render documentation or contact Render support for assistance.