FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies and FreeTDS (cross-platform solution)
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

# Configure FreeTDS and ODBC (handle both amd64 and arm64 library paths)
RUN ARCH_DIR=$(dpkg-architecture -q DEB_HOST_GNU_CPU 2>/dev/null || uname -m) \
    && if [ "$ARCH_DIR" = "x86_64" ] || [ "$ARCH_DIR" = "amd64" ]; then \
         ODBC_LIB_DIR="/usr/lib/x86_64-linux-gnu/odbc"; \
       else \
         ODBC_LIB_DIR="/usr/lib/aarch64-linux-gnu/odbc"; \
       fi \
    && echo "[FreeTDS]\nDescription = FreeTDS Driver\nDriver = ${ODBC_LIB_DIR}/libtdsodbc.so\nFileUsage = 1" > /etc/odbcinst.ini \
    && echo "[ODBC Driver 17 for SQL Server]\nDescription = FreeTDS Driver (Alias)\nDriver = ${ODBC_LIB_DIR}/libtdsodbc.so" >> /etc/odbcinst.ini \
    && echo "[ODBC Driver 18 for SQL Server]\nDescription = FreeTDS Driver (Alias)\nDriver = ${ODBC_LIB_DIR}/libtdsodbc.so" >> /etc/odbcinst.ini

# Configure FreeTDS
RUN echo "[global]\n\
    tds version = 7.4\n\
    text size = 64512" > /etc/freetds/freetds.conf

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Set environment variables
ENV ODBCINI=/etc/odbc.ini
ENV ODBCSYSINI=/etc
ENV FREETDS=/etc/freetds/freetds.conf

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]