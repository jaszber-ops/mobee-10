export default class Minimal {
  constructor(party) {
    this.party = party;
  }

  onConnect(conn) {
    console.log("✅ CONNECTION SUCCESSFUL:", conn.id);
    conn.send("Hello!");
  }

  onMessage(msg) {
    console.log("📩 Got message:", msg);
    this.party.broadcast("Echo: " + msg);
  }
}
