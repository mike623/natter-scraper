ake-Home Technical Assessment: E-Commerce Scraper
We are delighted to invite you to the next stage of our interview process: a take home technical assessment. This task is designed to be a practical, focused exercise to see how you approach a real-world problem and what you consider to be "production ready" code.
⏳ Time Estimate
We expect this task to take no more than 1-2 hours. If you find yourself spending longer than two hours, please stop and submit your work as-is, noting where you ran out of time. The goal is to see your approach and code quality rather than a fully optimized solution.
🛠️ The Challenge
Your task is to create a command line application that scrapes a publicly available e-commerce test page, processes the product data, and outputs a single JSON structure.
1. Target URL
The page to scrape is:
https://webscraper.io/test-sites/e-commerce/static
2. Requirements
The application must perform the following steps and adhere to the output structure:
Web Scrape: Fetch the main page and follow all available product links.
Data Aggregation: Collect the following data for every available product:
name (string)
description (string)
price (number, e.g., $1178.19 → 1178.19)
colors (string array, required only if multiple colour options are present)
HDD/Configuration Handling: If a product has multiple HDD (storage) options (e.g., 128GB, 256GB), each option must be returned as a separate product in the final results array, with the name updated to reflect the specific configuration.
Output Format: The application must output a single JSON object containing a results array and a total field.
3. Output Specification
The final output must be a single JSON object with two top-level fields:
results: A JSON array containing all individual products (including separated HDD options).
total: The sum of all unique product prices in the results array.
Example JSON Structure (for illustration):
JSON
{ "results": [ { "name": "Dell Latitude 5580 128 GB", "description": "...", "price": 1178.19 }, // ... separate entry for 256 GB, 512 GB ... { "name": "Samsung Galaxy", "description": "...", "price": 93.99, "colors": ["gold", "white", "black"] // Optional field } ], "total": 7476.47 // Sum of all prices in "results" }
💡 Guidance & Freedom
Language & Libraries: You may use any programming language, tools, or libraries you prefer.
AI Tools: We explicitly encourage the use of AI assistants (like Claude Code, GitHub Copilot, ChatGPT, or Gemini). This is a realistic part of modern development.
Best Practices: Please ensure your submission reflects best-practice application development. This is your opportunity to demonstrate your knowledge, experience and opinions. No one line perl scripts!
🧠 How We Assess
This task is intentionally simple in scope, especially with the aid of AI. We are less interested in feature complexity and more interested in how you approach building, shipping and operating production-quality software.
Treat this as something you would be happy to:
Hand to a teammate
Maintain in six months
Deploy and run in the real world
If you run out of time, please include a section in the README about any trade offs or future improvements you would make.
📦 Submission
Please submit your solution by sending a link to the source code (e.g., a public or unlisted GitHub repository) to ozgen@natter.co
