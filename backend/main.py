from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from dotenv import load_dotenv
import os, uuid, json

# Load .env variables
load_dotenv()
app = FastAPI()

# Enable CORS (for frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Groq API client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Session history store
chat_sessions = {}
history_file = "chat_history.json"

# Load old history
if os.path.exists(history_file):
    with open(history_file, "r") as f:
        raw_data = json.load(f)
        for sid, entry in raw_data.items():
            if isinstance(entry, list):
                # old format, migrate
                chat_sessions[sid] = {
                    "messages": entry,
                    "title": next((m["content"] for m in entry if m["role"] == "user"), "Untitled Session")
                }
            else:
                chat_sessions[sid] = entry

# System prompt
SYSTEM_PROMPT = {
    "role": "system",
    "content": """You are a real human doctor speaking to a patient in a clinic. Your name is Dr.Suriya Kumar , Multi specialist doctor, Ask only one question at a time. Get straight to the point.
Don't comment on symptoms like “that sounds uncomfortable” or “that can be concerning.” Don't explain common sense things. Don't summarize what the patient just said.
Ask focused questions like: “When did it start?”, “How bad is the pain?”, “Is it sharp or dull?”, “Have you had this before?”
Your tone is calm, professional, and natural — like a doctor with 15+ years of experience. Use short, plain sentences. Don’t be dramatic or robotic.
Once you've gathered enough info, summarize symptoms, suggest practical advice, and clearly state if the patient needs a doctor or emergency care."""
}

# Input model
class Message(BaseModel):
    session_id: str
    user_input: str

@app.post("/start")
def start():
    session_id = str(uuid.uuid4())
    chat_sessions[session_id] = {
        "messages": [SYSTEM_PROMPT],
        "title": "Untitled Session"
    }
    save()
    return {"session_id": session_id}

@app.post("/chat")
def chat(message: Message):
    session = chat_sessions.get(message.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session["title"] == "Untitled Session":
        session["title"] = message.user_input.strip()[:50]

    session["messages"].append({"role": "user", "content": message.user_input})

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=session["messages"],
        temperature=0.8,
        max_completion_tokens=512,
        top_p=1,
        stream=False
    )

    reply = response.choices[0].message.content.strip()
    session["messages"].append({"role": "assistant", "content": reply})
    save()

    return {"response": reply}

@app.get("/sessions")
def list_sessions():
    return [{"id": sid, "title": session.get("title", "Untitled Session")} for sid, session in chat_sessions.items()]

@app.get("/history/{session_id}")
def get_history(session_id: str):
    session = chat_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"history": session["messages"]}

def save():
    with open(history_file, "w") as f:
        json.dump(chat_sessions, f, indent=2)
