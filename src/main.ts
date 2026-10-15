import { createClient } from '@supabase/supabase-js'
import './style.css'

interface Message {
  id: string
  author_id: string
  nickname: string
  content: string
  created_at: string
}

const HISTORY_LIMIT = 50

const ERROR_TEXT: Record<string, string> = {
  EMPTY: '訊息不能是空的',
  TOO_LONG: '訊息太長了(上限 500 字)',
  RATE_LIMITED: '送太快了,請稍等幾秒',
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

const listEl = document.querySelector<HTMLUListElement>('#messages')!
const formEl = document.querySelector<HTMLFormElement>('#form')!
const inputEl = document.querySelector<HTMLInputElement>('#input')!
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const meEl = document.querySelector<HTMLSpanElement>('#me')!

function showStatus(text: string) {
  statusEl.textContent = text
  statusEl.hidden = false
}

function friendlyError(message: string): string {
  const code = Object.keys(ERROR_TEXT).find((c) => message.includes(c))
  return code ? ERROR_TEXT[code] : `送出失敗:${message}`
}

let myId = ''
const seen = new Set<string>()

function render(msg: Message) {
  if (seen.has(msg.id)) return
  seen.add(msg.id)

  const mine = msg.author_id === myId
  const li = document.createElement('li')
  if (mine) li.className = 'mine'

  const name = document.createElement('span')
  name.className = 'name'
  name.textContent = msg.nickname

  const time = document.createElement('time')
  time.textContent = new Date(msg.created_at).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const body = document.createElement('p')
  body.textContent = msg.content // textContent: never interpret user input as HTML

  li.append(name, time, body)

  const atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80
  listEl.append(li)
  if (atBottom || mine) listEl.scrollTop = listEl.scrollHeight
}

async function main() {
  if (!url || !key) {
    showStatus('尚未設定 Supabase。請複製 .env.example 為 .env.local 並填入網址與金鑰。')
    formEl.querySelector('button')!.disabled = true
    return
  }

  const supabase = createClient(url, key)

  // Anonymous sign-in: no UI, the browser just gets an identity (kept in localStorage).
  let session = (await supabase.auth.getSession()).data.session
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error || !data.session) {
      showStatus(`無法建立匿名身分:${error?.message ?? '未知錯誤'}`)
      return
    }
    session = data.session
  }
  myId = session.user.id

  const { data: nickname, error: joinError } = await supabase.rpc('join_chat')
  if (joinError) {
    showStatus(`無法進入聊天室:${joinError.message}`)
    return
  }
  meEl.textContent = `你是:${nickname}`

  supabase
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) =>
      render(payload.new as Message),
    )
    .subscribe()

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  if (error) {
    showStatus(`讀取訊息失敗:${error.message}`)
  } else {
    ;(data as Message[]).reverse().forEach(render)
    listEl.scrollTop = listEl.scrollHeight
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault()
    const content = inputEl.value.trim()
    if (!content) return
    inputEl.value = ''
    // The client only sends id + content; the database decides who/when.
    const { error } = await supabase.from('messages').insert({ id: crypto.randomUUID(), content })
    if (error) {
      inputEl.value = content
      showStatus(friendlyError(error.message))
    } else {
      statusEl.hidden = true
    }
  })
}

main()
