FROM node:20-bookworm-slim

# 1. Install Python + venv + build tools (for lxml, Pillow, etc.)
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
      python3 \
      python3-venv \
      python3-pip \
      build-essential \
      libxml2-dev \
      libxslt1-dev \
      git && \
    rm -rf /var/lib/apt/lists/*

# 2. Set working directory
WORKDIR /usr/src/app

# 3. Copy only package files first
COPY package*.json ./

# 4. Install Node dependencies (less strict, won’t fail on lockfile issues)
RUN npm install --omit=dev

# 5. Copy the rest of the backend code
COPY . .

# 6. Create Python venv
RUN python3 -m venv /venv
ENV PATH="/venv/bin:$PATH"

# 7. Install Python dependencies

RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir \
      -r RittDocConverter/requirements.txt \
      -r PDFtoXMLUsingExcel/requirements.txt

# 8. Env + port
ENV PORT=5000
EXPOSE 5000

# 8. Start backend
CMD ["npm", "start"]