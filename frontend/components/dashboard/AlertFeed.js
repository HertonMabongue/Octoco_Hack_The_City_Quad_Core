// A simple chronological feed of alerts — bin overflows and community
// littering reports both land here, since an operator cares about both.
export default function AlertFeed({ alerts }) {
  if (!alerts?.length) {
    return <p style={{ color: "#898781" }}>No active alerts.</p>;
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {alerts.map((alert) => (
        <li
          key={alert.id}
          style={{
            padding: "10px 0",
            borderBottom: "1px solid #e1e0d9",
            fontSize: 14,
          }}
        >
          <strong style={{ textTransform: "capitalize" }}>{alert.type}</strong>
          {" — "}
          {alert.message}
          <div style={{ color: "#898781", fontSize: 12 }}>
            {new Date(alert.createdAt).toLocaleString()}
          </div>
        </li>
      ))}
    </ul>
  );
}
