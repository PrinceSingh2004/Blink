import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"

export default function Page() {
  const [todos, setTodos] = useState<any[]>([])

  useEffect(() => {
    fetchTodos()
  }, [])

  async function fetchTodos() {
    const { data, error } = await supabase
      .from("todos")
      .select("*")

    if (!error && data) {
      setTodos(data)
    }
  }

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>
          {todo.name}
        </li>
      ))}
    </ul>
  )
}
