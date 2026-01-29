const { proto, downloadContentFromMessage, getContentType } = require('@whiskeysockets/baileys')
const fs = require('fs')

// =====================
// MEDIA DOWNLOADER (SAFE)
// =====================
const downloadMediaMessage = async (m, filename) => {
	try {
		if (!m || !m.msg || !m.type) return null

		if (m.type === 'viewOnceMessage') {
			m.type = m.msg.type
		}

		let mediaType
		let ext = ''

		switch (m.type) {
			case 'imageMessage':
				mediaType = 'image'
				ext = 'jpg'
				break
			case 'videoMessage':
				mediaType = 'video'
				ext = 'mp4'
				break
			case 'audioMessage':
				mediaType = 'audio'
				ext = 'mp3'
				break
			case 'stickerMessage':
				mediaType = 'sticker'
				ext = 'webp'
				break
			case 'documentMessage':
				mediaType = 'document'
				ext = (m.msg.fileName || '').split('.').pop() || 'bin'
				break
			default:
				return null
		}

		const fileName = filename ? `${filename}.${ext}` : `undefined.${ext}`
		const stream = await downloadContentFromMessage(m.msg, mediaType)
		let buffer = Buffer.from([])

		for await (const chunk of stream) {
			buffer = Buffer.concat([buffer, chunk])
		}

		fs.writeFileSync(fileName, buffer)
		return fs.readFileSync(fileName)

	} catch (err) {
		console.error('❌ Media download error:', err)
		return null
	}
}

// =====================
// MESSAGE NORMALIZER
// =====================
const sms = (ishan, m) => {
	try {
		if (m.key) {
			m.id = m.key.id
			m.chat = m.key.remoteJid
			m.fromMe = m.key.fromMe
			m.isGroup = m.chat.endsWith('@g.us')
			m.sender = m.fromMe
				? ishan.user.id.split(':')[0] + '@s.whatsapp.net'
				: m.isGroup
					? m.key.participant
					: m.key.remoteJid
		}

		if (m.message) {
			m.type = getContentType(m.message)

			m.msg =
				m.type === 'viewOnceMessage'
					? m.message[m.type]?.message?.[getContentType(m.message[m.type].message)]
					: m.message[m.type]

			if (m.msg) {
				if (m.type === 'viewOnceMessage') {
					m.msg.type = getContentType(m.message[m.type].message)
				}

				const ctx = m.msg.contextInfo || {}
				const mentioned = ctx.mentionedJid || []
				const quotedMention = ctx.participant || ''

				const mentionArray = Array.isArray(mentioned)
					? mentioned
					: typeof mentioned === 'string'
						? [mentioned]
						: []

				if (quotedMention) mentionArray.push(quotedMention)
				m.mentionUser = mentionArray.filter(Boolean)

				m.body =
					m.type === 'conversation' ? m.msg :
					m.type === 'extendedTextMessage' ? m.msg.text :
					m.type === 'imageMessage' && m.msg.caption ? m.msg.caption :
					m.type === 'videoMessage' && m.msg.caption ? m.msg.caption :
					m.type === 'templateButtonReplyMessage' ? m.msg.selectedId :
					m.type === 'buttonsResponseMessage' ? m.msg.selectedButtonId :
					''

				// =====================
				// QUOTED MESSAGE SAFE
				// =====================
				m.quoted = ctx.quotedMessage || null

				if (m.quoted) {
					m.quoted.type = getContentType(m.quoted)
					m.quoted.id = ctx.stanzaId
					m.quoted.sender = ctx.participant
					m.quoted.fromMe = (m.quoted.sender || '').split('@')[0] === ishan.user.id.split(':')[0]

					m.quoted.msg =
						m.quoted.type === 'viewOnceMessage'
							? m.quoted[m.quoted.type]?.message?.[getContentType(m.quoted[m.quoted.type].message)]
							: m.quoted[m.quoted.type]

					if (m.quoted.msg && m.quoted.type === 'viewOnceMessage') {
						m.quoted.msg.type = getContentType(m.quoted[m.quoted.type].message)
					}

					const qCtx = m.quoted.msg?.contextInfo || {}
					const qMentioned = qCtx.mentionedJid || []
					const qParticipant = qCtx.participant || ''

					const qMentionArr = Array.isArray(qMentioned)
						? qMentioned
						: typeof qMentioned === 'string'
							? [qMentioned]
							: []

					if (qParticipant) qMentionArr.push(qParticipant)
					m.quoted.mentionUser = qMentionArr.filter(Boolean)

					m.quoted.fakeObj = proto.WebMessageInfo.fromObject({
						key: {
							remoteJid: m.chat,
							fromMe: m.quoted.fromMe,
							id: m.quoted.id,
							participant: m.quoted.sender
						},
						message: m.quoted
					})

					m.quoted.download = (filename) => downloadMediaMessage(m.quoted, filename)
					m.quoted.delete = () => ishan.sendMessage(m.chat, { delete: m.quoted.fakeObj.key })
					m.quoted.react = (emoji) =>
						ishan.sendMessage(m.chat, { react: { text: emoji, key: m.quoted.fakeObj.key } })
				}
			}

			m.download = (filename) => downloadMediaMessage(m, filename)
		}

		// =====================
		// REPLY HELPERS (UNCHANGED API)
		// =====================
		m.reply = (text, id = m.chat, option = { mentions: [m.sender] }) =>
			ishan.sendMessage(id, { text, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })

		m.replyS = (sticker, id = m.chat, option = { mentions: [m.sender] }) =>
			ishan.sendMessage(id, { sticker, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })

		m.replyImg = (img, text, id = m.chat, option = { mentions: [m.sender] }) =>
			ishan.sendMessage(id, { image: img, caption: text, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })

		m.replyVid = (vid, text, id = m.chat, option = { mentions: [m.sender], gif: false }) =>
			ishan.sendMessage(id, { video: vid, caption: text, gifPlayback: option.gif, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })

		m.replyAud = (aud, id = m.chat, option = { mentions: [m.sender], ptt: false }) =>
			ishan.sendMessage(id, { audio: aud, ptt: option.ptt, mimetype: 'audio/mpeg', contextInfo: { mentionedJid: option.mentions } }, { quoted: m })

		m.replyDoc = (doc, id = m.chat, option = { mentions: [m.sender], filename: 'undefined.pdf', mimetype: 'application/pdf' }) =>
			ishan.sendMessage(id, { document: doc, mimetype: option.mimetype, fileName: option.filename, contextInfo: { mentionedJid: option.mentions } }, { quoted: m })

		m.replyContact = (name, info, number) => {
			const vcard =
				'BEGIN:VCARD\n' +
				'VERSION:3.0\n' +
				`FN:${name}\n` +
				`ORG:${info};\n` +
				`TEL;type=CELL;type=VOICE;waid=${number}:+${number}\n` +
				'END:VCARD'
			ishan.sendMessage(m.chat, { contacts: { displayName: name, contacts: [{ vcard }] } }, { quoted: m })
		}

		m.react = (emoji) =>
			ishan.sendMessage(m.chat, { react: { text: emoji, key: m.key } })

		return m

	} catch (err) {
		console.error('❌ msg.js normalize error:', err)
		return m
	}
}

module.exports = { sms, downloadMediaMessage }
