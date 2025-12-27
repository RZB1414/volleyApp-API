FROM rstudio/plumber

# Install system dependencies required for R packages
# libcurl4-openssl-dev: for curl/httr/aws.s3
# libssl-dev: for openssl
# libxml2-dev: for xml2 (dependency of many packages)
RUN apt-get update -qq && apt-get install -y \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install R packages
# datavolley is not on CRAN, install from GitHub
RUN R -e "install.packages(c('remotes', 'jsonlite', 'aws.s3', 'dotenv'), repos='https://cloud.r-project.org/')"
RUN R -e "remotes::install_github('openvolley/datavolley')"

# Copy the app files
COPY . /app
WORKDIR /app

# Expose port 8000
EXPOSE 8000

# Run the API
ENTRYPOINT ["R", "-e", "pr <- plumber::plumb('plumber.R'); pr$run(host='0.0.0.0', port=8000)"]
