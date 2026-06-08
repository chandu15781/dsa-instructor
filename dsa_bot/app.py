"""
====================================================
  AlgoMentor — DSA Instructor Chatbot
  Python Flask Backend
====================================================

HOW IT WORKS:
  1. Flask serves the HTML page at http://localhost:8000
  2. User types a message → JavaScript sends it to /chat
  3. Python calls the Anthropic (Claude) API
  4. Claude responds as a DSA professor
  5. Response goes back to browser and shown in chat

FILE STRUCTURE:
  app.py                ← YOU ARE HERE (server)
  requirements.txt      ← pip packages
  templates/
      index.html        ← web page
  static/
      style.css         ← styling
      script.js         ← browser logic
"""

import os
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv
# Load .env from parent directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# pyrefly: ignore [missing-import]
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
# pyrefly: ignore [missing-import]
from groq import Groq

# ─────────────────────────────────────────────────
#  Create Flask app
# ─────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────────
#  Groq client  (uses GROQ_API_KEY env var)
# ─────────────────────────────────────────────────
client = Groq(
    api_key=os.environ.get("GROQ_API_KEY", "")
)

# ─────────────────────────────────────────────────
#  DSA Instructor System Prompt
#  This tells Claude exactly HOW to behave
# ─────────────────────────────────────────────────
SYSTEM_PROMPT = """You are AlgoMentor, a world-class Data Structures & Algorithms (DSA) instructor.

YOUR PERSONALITY:
- Patient, encouraging, and enthusiastic about CS concepts
- You celebrate when students understand something
- You never make students feel dumb for not knowing

YOUR TEACHING METHOD:
- Always start from scratch (assume beginner level unless told otherwise)
- Build up complexity step by step
- Use real-world analogies before technical definitions
- Always write clean, well-commented Python code examples
- Always analyze Time and Space complexity (Big-O)

RESPONSE FORMAT — always use this structure:
- Use ### for section headings
- Use **bold** for key terms on first use
- Use `inline code` for variable names, functions, data types
- Use triple-backtick python blocks for all code
- Use bullet points for lists
- End algorithm explanations with a Complexity box

TOPICS YOU MASTER:
  Data Structures: Arrays, Strings, Linked Lists (Singly/Doubly), 
    Stacks, Queues, Deques, Hash Maps, Sets, Trees (Binary/BST/AVL),
    Heaps, Tries, Graphs, Segment Trees, Disjoint Set Union
    
  Algorithms: Linear/Binary Search, Bubble/Selection/Insertion/
    Merge/Quick/Heap/Counting Sort, BFS, DFS, Dijkstra, 
    Bellman-Ford, Floyd-Warshall, Prim, Kruskal,
    Dynamic Programming (Memoization + Tabulation),
    Greedy, Divide & Conquer, Backtracking, Sliding Window,
    Two Pointers, Prefix Sums, Bit Manipulation

  Concepts: Big-O / Omega / Theta, Recursion, Amortized Analysis,
    Space-Time tradeoffs, Interview strategies

WHEN SOLVING PROBLEMS:
  1. Restate the problem clearly
  2. Walk through a brute-force approach + its complexity
  3. Identify the bottleneck
  4. Derive the optimal solution step by step
  5. Write clean Python code with comments
  6. State Time and Space complexity
  7. Mention edge cases

Always end with "💡 **Key Takeaway:**" summarizing the main insight.
"""


# ─────────────────────────────────────────────────
#  ROUTE 1:  GET /
#  Serves the main HTML page to the browser
# ─────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


# ─────────────────────────────────────────────────
#  ROUTE 2:  POST /chat
#  Receives messages, calls Claude, returns reply
# ─────────────────────────────────────────────────
@app.route("/chat", methods=["POST"])
def chat():
    """
    Request body (JSON):
        { "messages": [ {"role": "user", "content": "..."}, ... ] }

    Response (JSON):
        { "reply": "Claude's response here" }
        OR
        { "error": "error message" }
    """
    try:
        data = request.get_json()

        # Validate input
        if not data or "messages" not in data:
            return jsonify({"error": "Missing 'messages' in request body"}), 400

        messages = data["messages"]
        if not messages:
            return jsonify({"error": "Messages list is empty"}), 400

        # Validate message format
        for msg in messages:
            if "role" not in msg or "content" not in msg:
                return jsonify({"error": "Each message must have 'role' and 'content'"}), 400

        # ── Call the Groq API ──────────────────
        messages_to_send = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages_to_send,
        )

        reply = response.choices[0].message.content
        return jsonify({"reply": reply})

    except Exception as e:
        error_str = str(e).lower()
        if "401" in error_str or "authentication" in error_str or "invalid" in error_str:
            return jsonify({
                "error": "❌ Invalid API key. Set GROQ_API_KEY correctly."
            }), 401
        elif "429" in error_str or "rate limit" in error_str:
            return jsonify({
                "error": "⏳ Rate limit reached. Please wait a moment and try again."
            }), 429
        elif "connection" in error_str:
            return jsonify({
                "error": "🌐 Cannot connect to Groq API. Check your internet connection."
            }), 503
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500


# ─────────────────────────────────────────────────
#  Run the dev server
# ─────────────────────────────────────────────────
if __name__ == "__main__":
    api_key = os.environ.get("GROQ_API_KEY", "")
    print("\n" + "═" * 50)
    print("  🧠  AlgoMentor — DSA Instructor Chatbot")
    print("═" * 50)

    if not api_key:
        print("\n  ⚠️  WARNING: GROQ_API_KEY is not set!")
        print("  Set it before running.")
    else:
        print(f"\n  ✅  API Key loaded (...{api_key[-6:]})")

    print("\n  📡  Server → http://localhost:8000")
    print("  Press Ctrl+C to stop\n")
    app.run(debug=True, port=8000)
