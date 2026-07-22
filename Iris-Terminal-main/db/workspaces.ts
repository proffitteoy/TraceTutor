import { Tables, TablesInsert, TablesUpdate } from "@/types/database"

export const getHomeWorkspaceByUserId = async (userId: string) => {
  const workspaces: Tables<"workspaces">[] = await getWorkspacesByUserId(userId)
  const home = workspaces.find(workspace => workspace.is_home)
  if (!home) {
    throw new Error("Home workspace not found")
  }
  return home.id
}

export const getWorkspaceById = async (workspaceId: string) => {
  const response = await fetch(`/api/local/workspaces/${workspaceId}`)
  if (response.ok) {
    return await response.json()
  }

  const bootstrapResponse = await fetch("/api/local/bootstrap")
  if (!bootstrapResponse.ok) {
    throw new Error("Workspace not found")
  }

  const bootstrapJson = await bootstrapResponse.json()
  if (!bootstrapJson?.workspace) {
    throw new Error("Workspace not found")
  }

  return bootstrapJson.workspace
}

export const getWorkspacesByUserId = async (userId: string) => {
  const response = await fetch("/api/local/workspaces")
  if (!response.ok) {
    throw new Error("Failed to load workspaces")
  }
  return await response.json()
}

export const createWorkspace = async (
  workspace: TablesInsert<"workspaces">
) => {
  const response = await fetch("/api/local/workspaces", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(workspace)
  })

  if (!response.ok) {
    throw new Error("Failed to create workspace")
  }

  return await response.json()
}

export const updateWorkspace = async (
  workspaceId: string,
  workspace: TablesUpdate<"workspaces">
) => {
  const response = await fetch(`/api/local/workspaces/${workspaceId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(workspace)
  })

  if (!response.ok) {
    throw new Error("Failed to update workspace")
  }

  return await response.json()
}

export const deleteWorkspace = async (workspaceId: string) => {
  const response = await fetch(`/api/local/workspaces/${workspaceId}`, {
    method: "DELETE"
  })

  if (!response.ok) {
    throw new Error("Failed to delete workspace")
  }

  return true
}
