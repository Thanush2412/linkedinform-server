# LinkedIn Form Server

## Deployment Instructions for Render

### Prerequisites

1. A MongoDB Atlas account with a database set up
2. A Render account

### Steps to Deploy on Render

1. **Update Environment Variables**

   Open the `render.yaml` file and replace the placeholder values with your actual values:

   ```yaml
   - key: MONGODB_URI
     value: mongodb+srv://<your-mongodb-atlas-connection-string>
     # Replace with your actual MongoDB Atlas connection string
   - key: ALLOWED_ORIGINS
     value: https://your-frontend-app.onrender.com
     # Replace with your actual frontend URL on Render
   - key: JWT_SECRET
     value: your-secure-jwt-secret-key
     # Replace with a secure random string
   ```

2. **Deploy to Render**

   - Log in to your Render account
   - Click on "New" and select "Blueprint"
   - Connect your GitHub repository
   - Render will automatically detect the `render.yaml` file and configure your service
   - Click "Apply" to start the deployment

3. **Verify Deployment**

   - Once deployed, Render will provide a URL for your service
   - Test the health endpoint: `https://your-service-url.onrender.com/api/health`
   - If you see a JSON response with status "healthy", your deployment is successful

## Local Development

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file with the required environment variables (see `.env.example`)

3. Start the development server:
   ```
   npm run dev
   ```

## Environment Variables

Make sure the following environment variables are set in your Render deployment:

- `NODE_ENV`: Set to "production" for deployment
- `PORT`: The port your server will run on (default: 5000)
- `MONGODB_URI`: Your MongoDB connection string
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS
- `JWT_SECRET`: Secret key for JWT token generation
- `DEFAULT_ADMIN_EMAIL`: Email for the default admin account
- `DEFAULT_ADMIN_PASSWORD`: Password for the default admin account
- `SUPERADMIN_EMAIL`: Email for the superadmin account
- `SUPERADMIN_PASSWORD`: Password for the superadmin account