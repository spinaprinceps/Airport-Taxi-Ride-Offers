// Prints a backend error body: the message, then each violation as "R3: ...".
// The frontend never blocks a value; it only shows what the backend says.
export default function ErrorList({ error }) {
  if (!error) return null;
  const violations = error.violations ?? [];
  // With one violation the message is that violation's text, so don't print it twice.
  const showMessage = !(violations.length === 1 && violations[0].message === error.message);
  return (
    <div className="error-box" role="alert">
      {showMessage && <p className="error-message">{error.message}</p>}
      {violations.length > 0 && (
        <ul>
          {violations.map((vi, i) => (
            <li key={i}>
              {vi.rule ? <strong>{vi.rule}: </strong> : null}
              {vi.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
