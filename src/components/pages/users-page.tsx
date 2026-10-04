"use client";
import { useState } from "react";
import { api, jsonBody, unwrap } from "@/lib/api";
import type { User } from "@/lib/types";
import { Empty, ErrorMessage, Loading, PageHeader, Modal, LoadingModal } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";
import { useAuth } from "@/components/auth-provider";

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const list = useApiData<User[] | { results: User[] }>("/users/");
  const rows = list.data ? unwrap(list.data) : [];
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function toggle(u: User) {
    await api(`/users/${u.id}/`, {
      method: "PATCH",
      body: jsonBody({ is_active: !u.is_active }),
    });
    await list.reload();
  }

  async function performDelete(u: User) {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api(`/users/${u.id}/`, { method: "DELETE" });
      setUserToDelete(null);
      await list.reload();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Unable to delete user.");
    } finally {
      setIsDeleting(false);
    }
  }

  function handleCloseModal() {
    setUserToDelete(null);
    setDeleteError(null);
  }

  return (
    <>
      <PageHeader
        title="User Management"
        description="Manage Student, Instructor, and Admin accounts. Deactivate accounts to suspend access, or delete records that have no protected history."
      />
      {list.loading ? (
        <Loading variant="table" />
      ) : list.error ? (
        <ErrorMessage message={list.error} />
      ) : !rows.length ? (
        <Empty message="No users." />
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isSelf = Boolean(currentUser && currentUser.id === u.id);
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <strong>{u.name || u.email}</strong>
                        {isSelf && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              padding: "0.15rem 0.45rem",
                              borderRadius: "4px",
                              backgroundColor: "var(--color-primary-light, #e0f2fe)",
                              color: "var(--color-primary-dark, #0369a1)",
                            }}
                          >
                            You
                          </span>
                        )}
                      </div>
                      <div className="muted">{u.email}</div>
                    </td>
                    <td>{u.role}</td>
                    <td>{u.department || "—"}</td>
                    <td>{u.is_active ? "Active" : "Inactive"}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          className={
                            u.is_active ? "btn btn-danger" : "btn btn-secondary"
                          }
                          onClick={() => void toggle(u)}
                        >
                          {u.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          className="btn btn-danger"
                          title={isSelf ? "You cannot delete your own account" : "Delete user"}
                          disabled={isSelf}
                          onClick={() => {
                            setDeleteError(null);
                            setUserToDelete(u);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {userToDelete && (
        <Modal
          open={!!userToDelete}
          title="Confirm User Deletion"
          onCloseAction={handleCloseModal}
        >
          {deleteError ? (
            <div className="mb-4">
              <ErrorMessage message={deleteError} />
            </div>
          ) : (
            <div className="mb-4">
              <p>
                Are you sure you want to permanently delete user{" "}
                <strong>{userToDelete.name || userToDelete.email}</strong>?
              </p>
              <p
                className="muted"
                style={{
                  fontSize: "0.85rem",
                  marginTop: "0.75rem",
                  lineHeight: "1.4",
                  padding: "0.6rem 0.8rem",
                  borderRadius: "6px",
                  backgroundColor: "var(--color-surface-subtle, #f8fafc)",
                  border: "1px solid var(--color-border, #e2e8f0)",
                }}
              >
                <strong>Data Protection Notice:</strong> Permanent deletion is irreversible.
                If this user has issued certificates, enrollments, or audit logs, deletion will be blocked
                to protect system and verification integrity. If you only wish to prevent login, use <strong>Deactivate</strong> instead.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <button
              className="btn btn-secondary"
              onClick={handleCloseModal}
              disabled={isDeleting}
            >
              {deleteError ? "Close" : "Cancel"}
            </button>
            {!deleteError && (
              <button
                className="btn btn-danger"
                onClick={() => void performDelete(userToDelete)}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete User"}
              </button>
            )}
          </div>
        </Modal>
      )}
      <LoadingModal open={isDeleting} title="Deleting User" message="Please wait..." />
    </>
  );
}
