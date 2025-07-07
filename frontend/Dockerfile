# Dockerfile for React frontend
FROM node:16

# Set the working directory inside the container
WORKDIR /app

# Copy the package.json and package-lock.json first to install dependencies
COPY package.json package-lock.json /app/

# Install React dependencies
RUN npm install

# Copy the rest of the React app code into the container
COPY . /app/

# Build the React app for production
RUN npm run build

# Install a simple HTTP server to serve the static files
RUN npm install -g serve

# Expose the port React will run on
EXPOSE 3000

# Serve the React app on 0.0.0.0:3000
CMD ["serve", "-s", "build", "-l", "0.0.0.0:3000"]
