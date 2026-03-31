import requests
import os
import json


def get_gemini_models(api_key):
    url = "https://generativelanguage.googleapis.com/v1beta/models"
    headers = {
        "Content-Type": "application/json",
    }
    params = {"key": api_key}

    response = requests.get(url, headers=headers, params=params)

    if response.status_code == 200:
        data = response.json()
        models = [model["name"] for model in data.get("models", [])]

        output_file = os.path.join(os.getcwd(), "gemini_model_names.txt")
        with open(output_file, "w", encoding="utf-8") as f:
            for model_name in models:
                f.write(model_name + "\n")

        print(f"✅ মোট {len(models)} টি মডেল পাওয়া গেছে!")
        print(f"📄 মডেল নামগুলো {output_file} ফাইলে সেভ হয়েছে।")
    else:
        print(f"❌ কিছু একটা ভুল হয়েছে! (Status: {response.status_code})")
        print(response.text)


if __name__ == "__main__":
    # এখানে তোমার Gemini API Key বসাও
    GEMINI_API_KEY = "AIzaSyBNntJe32_2K97d_FZFnTQzItt7a47sWKI"

    if GEMINI_API_KEY == "YOUR_GEMINI_API_KEY_HERE":
        print("⚠️ প্রথমে কোডের ভিতরে তোমার Gemini API Key বসাও!")
    else:
        get_gemini_models(GEMINI_API_KEY)
