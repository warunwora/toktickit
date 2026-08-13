import { useState } from "react";
import { checkSystem, Category } from "./api.js";

// UI states handled for Issue 4: idle, loading, success, error.
type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);

  async function handleCheck() {
    setState("loading");
    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState("success");
    } catch {
      setCategories([]);
      setState("error");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button className="btn btn-success" onClick={handleCheck} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      {state === "loading" && <p className="mt-4 text-muted">⏳ loading…</p>}

      {state === "success" && (
        <div className="mt-4">
          <p>
            System Status: <span className="badge bg-success">Online</span>
          </p>
          <h2 className="h6">Supported Request Categories</h2>
          <ol className="list-group list-group-numbered">
            {categories.map((c) => (
              <li key={c.id} className="list-group-item">
                {c.name}
              </li>
            ))}
          </ol>
        </div>
      )}

      {state === "error" && (
        <div className="alert alert-danger mt-4" role="alert">
          <p className="mb-0">
            System Status: <strong>Offline</strong>
          </p>
          <p className="mb-0">Unable to connect to TokTickIT API</p>
        </div>
      )}
    </div>
  );
}
