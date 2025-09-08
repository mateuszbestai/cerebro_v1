FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies and FreeTDS (more reliable cross-platform solution)
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    unixodbc \
    unixodbc-dev \
    freetds-dev \
    freetds-bin \
    tdsodbc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Configure FreeTDS driver for ODBC
RUN echo "[FreeTDS]\n\
Description = FreeTDS Driver\n\
Driver = /usr/lib/$(uname -m)-linux-gnu/odbc/libtdsodbc.so\n\
Setup = /usr/lib/$(uname -m)-linux-gnu/odbc/libtdsS.so" >> /etc/odbcinst.ini

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Set environment variable to use FreeTDS by default
ENV ODBC_DRIVER="FreeTDS"

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]