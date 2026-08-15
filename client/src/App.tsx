// Scaffold only: Issue 2 wires the [Check System] button to the API and adds the
// status states, Issue 4 adds the category list.
export default function App() {
  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button className="btn btn-success">Check System</button>
    </div>
  );
}
