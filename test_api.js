// Native fetch available in Node 18+
async function testChat() {
    try {
        const response = await fetch('http://localhost:5000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: "Hello AI" })
        });
        const data = await response.json();
        console.log("RESPONSE:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("TEST FAILED:", err.message);
    }
}

testChat();
