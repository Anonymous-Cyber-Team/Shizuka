const fs = require('fs');
const axios = require('axios');
const path = require('path');

/**
 * Dynamically fetches all available Google Gemini models using the current API keys
 * and saves the extracted data into a neatly formatted text file.
 */
async function fetchGeminiModels() {
    try {
        // Read the configuration file to extract API keys
        const configPath = path.join(__dirname, 'config.json');
        
        if (!fs.existsSync(configPath)) {
            console.error('Error: config.json not found in the root directory.');
            return;
        }

        const configRaw = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configRaw);
        const apiKeys = config.GEMINI_API_KEYS;

        if (!apiKeys || !Array.isArray(apiKeys) || apiKeys.length === 0) {
            console.error('Error: No GEMINI_API_KEYS found in config.json.');
            return;
        }

        let fetchedModels = null;

        // Iterate through the API keys to handle potentially blocked/rate-limited keys
        for (const key of apiKeys) {
            try {
                console.log(`Attempting to fetch models with API key starting with ${key.substring(0, 10)}...`);
                
                // Fetch the list of models using the REST API equivalent
                const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
                
                if (response.data && response.data.models) {
                    fetchedModels = response.data.models;
                    console.log('Successfully fetched models!');
                    break; // Stop iterating once a successful fetch occurs
                }
            } catch (error) {
                console.log(`Failed with this API key. Reason: ${error.response ? error.response.statusText : error.message}`);
                // Proceed to the next key if the current one fails
            }
        }

        // If none of the keys worked
        if (!fetchedModels) {
            console.error('Error: Could not fetch models. All provided API keys failed or were blocked.');
            return;
        }

        // Format the response to clearly show specific model details
        let formattedData = "=== Supported Google Gemini Models ===\n\n";

        fetchedModels.forEach(model => {
            formattedData += `Model Name: ${model.name || 'N/A'}\n`;
            formattedData += `Display Name: ${model.displayName || 'N/A'}\n`;
            formattedData += `Supported Generation Methods: ${model.supportedGenerationMethods ? model.supportedGenerationMethods.join(', ') : 'N/A'}\n`;
            formattedData += `------------------------------------------------------------\n`;
        });

        // Write the formatted data into supported_gemini_models_list.txt
        const outputPath = path.join(__dirname, 'supported_gemini_models_list.txt');
        fs.writeFileSync(outputPath, formattedData, 'utf8');

        console.log(`\nSuccessfully created and saved the model list to: ${outputPath}`);

    } catch (globalError) {
        // Catch any other unexpected errors (e.g., file system permissions, bad JSON)
        console.error('An unexpected error occurred during execution:', globalError.message);
    }
}

// Execute the function
fetchGeminiModels();
