# Frontend Dockerfile (Vite dev server)
FROM node:20-alpine

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production=false

# Copy rest of the frontend code
COPY . .

EXPOSE 3000

# Run Vite dev server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]