# Dockerfile for FastAPI backend
FROM python:3.9-slim

# Set the working directory inside the container
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy the application code into the container
COPY . /app

# Set the environment variable GROQ_API_KEY_1 (will be overwritten by docker-compose)
ENV GROQ_API_KEY_1=${GROQ_API_KEY_1}

# Expose the port FastAPI will run on
EXPOSE 8000

# Command to run the FastAPI app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
