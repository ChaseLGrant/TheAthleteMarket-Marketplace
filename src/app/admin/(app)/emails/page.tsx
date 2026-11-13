import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { Pill } from "@/components/status";
import { dateTime } from "@/lib/format";
import { getDeps } from "@/lib/server";

export default async function Emails() {
  await requireAdmin();
  const emails = await (await getDeps()).store.listEmails({ limit: 300 });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Emails</h1>
      <div className="card overflow-x-auto">
        <table className="table-admin">
          <thead><tr><th>Sent</th><th>Template</th><th>To</th><th>Subject</th><th>Status</th><th>Request</th><th>Provider id / error</th></tr></thead>
          <tbody>
            {emails.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-muted">{dateTime(e.created_at)}</td>
                <td>{e.template}</td><td>{e.to_email}</td><td className="max-w-xs truncate">{e.subject}</td>
                <td><Pill value={e.status === "sent" ? "succeeded" : e.status} /></td>
                <td>{e.request_id ? <Link className="text-blue" href={`/admin/requests/${e.request_id}`}>open</Link> : "—"}</td>
                <td className="text-xs text-muted">{e.error ?? e.provider_id}</td>
              </tr>
            ))}
            {!emails.length && <tr><td colSpan={7} className="py-6 text-center text-muted">No emails yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
