import React from "react";
import { Terminal, Database, FileText, Layers, Play } from "lucide-react";

export default function SnowflakeSimulator() {
  return (
    <div>
      <div className="page-header" style={{ marginBottom: "20px" }}>
        <div>
          <h1 className="page-title" style={{ display: "flex", alignContent: "center", gap: "10px" }}>
            <Terminal style={{ color: "var(--secondary)" }} /> Snowflake Console Simulator
          </h1>
          <p className="page-subtitle">
            Use this page to test the ClassifyAI Chrome Extension! It mocks a database dashboard with HTML tables.
          </p>
        </div>
      </div>

      <div
        style={{
          background: "rgba(259, 259, 259, 0.05)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          padding: "16px",
          borderRadius: "8px",
          marginBottom: "24px",
          fontSize: "13px",
          lineHeight: "1.6"
        }}
      >
        <span style={{ fontWeight: 700, color: "var(--primary)" }}>Chrome Extension Demonstration Instructions:</span>
        <ol style={{ marginLeft: "20px", marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <li>Open your browser settings and navigate to the <strong>Extensions</strong> manager page (or type <code>chrome://extensions</code> in the URL bar).</li>
          <li>Turn on <strong>Developer Mode</strong> in the top-right corner.</li>
          <li>Click <strong>Load unpacked</strong> in the top-left and select the <code>extension</code> directory inside this project folder.</li>
          <li>Return to this tab. You will see a floating <strong>Classify page schema</strong> launcher in the bottom right!</li>
          <li>Click the launcher or the extension popup. It will scan these tables and dynamically inject security classification tags next to the column headers below!</li>
        </ol>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        
        {/* Table 1: Raw Logins */}
        <div className="glass-panel" style={{ background: "#0a0a0d", borderColor: "rgba(255, 255, 255, 0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <Database size={16} style={{ color: "var(--primary)" }} />
            <h3 id="raw_user_logins" style={{ fontSize: "15px", fontWeight: 600 }}>raw_user_logins</h3>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "16px" }}>
            Raw event log of user logins on corporate application dashboard.
          </p>

          <div className="table-container">
            <table className="custom-table" style={{ fontSize: "12px" }}>
              <thead>
                <tr>
                  <th>user_name</th>
                  <th>email</th>
                  <th>login_ip</th>
                  <th>country</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>John Smith</td>
                  <td>john.smith@gmail.com</td>
                  <td>192.168.1.45</td>
                  <td>USA</td>
                </tr>
                <tr>
                  <td>Jane Doe</td>
                  <td>jane_doe@yahoo.com</td>
                  <td>74.125.19.14</td>
                  <td>Canada</td>
                </tr>
                <tr>
                  <td>Michael Brown</td>
                  <td>mbrown12@gmail.com</td>
                  <td>172.217.7.14</td>
                  <td>UK</td>
                </tr>
                <tr>
                  <td>Alice Johnson</td>
                  <td>alice.j@corp.com</td>
                  <td>209.85.233.100</td>
                  <td>Germany</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Billing Payments */}
        <div className="glass-panel" style={{ background: "#0a0a0d", borderColor: "rgba(255, 255, 255, 0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <Database size={16} style={{ color: "var(--secondary)" }} />
            <h3 id="billing_payments" style={{ fontSize: "15px", fontWeight: 600 }}>billing_payments</h3>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "16px" }}>
            Audit trail of customer subscription billing payments.
          </p>

          <div className="table-container">
            <table className="custom-table" style={{ fontSize: "12px" }}>
              <thead>
                <tr>
                  <th>payment_id</th>
                  <th>card_number</th>
                  <th>billing_zip</th>
                  <th>amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>TXN-9921</td>
                  <td>4111111111111111</td>
                  <td>90210</td>
                  <td>$45.99</td>
                </tr>
                <tr>
                  <td>TXN-3829</td>
                  <td>5500123456789012</td>
                  <td>10001</td>
                  <td>$120.00</td>
                </tr>
                <tr>
                  <td>TXN-1048</td>
                  <td>378282246310005</td>
                  <td>20005</td>
                  <td>$9.99</td>
                </tr>
                <tr>
                  <td>TXN-4819</td>
                  <td>4222333344445555</td>
                  <td>60601</td>
                  <td>$1450.50</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
