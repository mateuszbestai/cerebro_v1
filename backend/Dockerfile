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

# Configure FreeTDS and ODBC
RUN echo "[FreeTDS]\n\
Description = FreeTDS Driver\n\
Driver = /usr/lib/x86_64-linux-gnu/odbc/libtdsodbc.so\n\
Setup = /usr/lib/x86_64-linux-gnu/odbc/libtdsS.so\n\
FileUsage = 1" > /etc/odbcinst.ini

# Also add ODBC Driver 17 alias for compatibility
RUN echo "[ODBC Driver 17 for SQL Server]\n\
Description = FreeTDS Driver (Alias)\n\
Driver = /usr/lib/x86_64-linux-gnu/odbc/libtdsodbc.so" >> /etc/odbcinst.ini

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