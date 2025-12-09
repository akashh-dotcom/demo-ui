# Backend Dockerfile
FROM node:20-bullseye

# 1. Install Python + venv + build tools (for lxml, Pillow, etc.)
RUN apt-get update && \
    apt-get install -y \
      python3 \
      python3-venv \
      python3-pip \
      build-essential \
      libxml2-dev \
      libxslt1-dev && \
    rm -rf /var/lib/apt/lists/*

# 2. Set working directory
WORKDIR /usr/src/app

# 3. Install Node dependencies
COPY package*.json ./
RUN npm install

# 4. Copy the rest of the backend code (includes RittDocConverter & PDFtoXMLUsingExcel)
COPY . .

# 5. Create a single global Python venv for ALL pipelines
RUN python3 -m venv /venv
ENV PATH="/venv/bin:$PATH"

# 6. Install Python dependencies for both pipelines from requirements files
#    Make sure these files exist in your repo
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir \
      -r RittDocConverter/requirements.txt \
      -r PDFtoXMLUsingExcel/requirements.txt

# 7. Env + port
ENV PORT=5000
EXPOSE 5000

# 8. Start backend
CMD ["npm", "start"]