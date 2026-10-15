import { createClient } from '@supabase/supabase-js'
import './style.css'

interface Message {
  id: number
  nickname: string
  content: string
  created_at: string
}

const HISTORY_LIMIT = 50

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

function randomNickname(): string {
  const animals = ['貓', '狗', '兔', '狐', '熊', '鹿', '鳥', '鯨']
  const animal = animals[Math.floor(Math.random() * animals.length)]
  return `匿名${animal}${Math.floor(Math.random() * 900 + 100)}`
}

function loadNickname(): string {
  try {
    const saved = localStorage.getItem('nickname')
    if (saved) return saved
    const fresh = randomNickname()
    localStorage.setItem('nickname', fresh)
    return fresh
  } catch {
    return randomNickname()
  }
}

const nickname = loadNickname()
meEl.textContent = `你是:${nickname}`

const seen = new Set<number>()

function render(msg: Message) {
  if (seen.has(msg.id)) return
  seen.add(msg.id)

  const li = document.createElement('li')
  if (msg.nickname === nickname) li.className = 'mine'

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
  if (atBottom || li.classList.contains('mine')) listEl.scrollTop = listEl.scrollHeight
}

async function main() {
  if (!url || !key) {
    showStatus('尚未設定 Supabase。請複製 .env.example 為 .env.local 並填入網址與金鑰。')
    formEl.querySelector('button')!.disabled = true
    return
  }

  const supabase = createClient(url, key)

  supabase
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) =>
      render(payload.new as Message),
    )
    .subscribe()

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('id', { ascending: false })
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
    const { error } = await supabase.from('messages').insert({ nickname, content })
    if (error) {
      inputEl.value = content
      showStatus(`送出失敗:${error.message}`)
    } else {
      statusEl.hidden = true
    }
  })
}

main()
