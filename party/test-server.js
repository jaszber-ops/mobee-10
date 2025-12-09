// Minimal test server
export default class TestServer {
  constructor(party) {
    this.party = party;
  }

  onConnect(conn) {
    console.log("Client connected:", conn.id);
    conn.send("Hello from PartyKit!");
  }

  onMessage(message, sender) {
    console.log("Received message:", message);
    this.party.broadcast(`Echo: ${message}`);
  }
}
