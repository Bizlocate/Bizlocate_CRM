"use client";

import TodoTasksBrowser from "@/components/TodoTasksBrowser";

export default function TodoTasksPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>To Do</div>
      <TodoTasksBrowser />
    </div>
  );
}
