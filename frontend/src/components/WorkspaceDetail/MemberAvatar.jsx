// Fixed, saturated palette so initials stay legible in white text - picked
// per member by id so the same person always gets the same color.
const AVATAR_COLORS = [
  '#b3413e', '#1f8a86', '#b8860b', '#6a4fb3',
  '#2f6690', '#3f7d47', '#c15b3c', '#5c6b73',
]

function colorForMember(id) {
  return AVATAR_COLORS[Math.abs(id ?? 0) % AVATAR_COLORS.length]
}

export default function MemberAvatar({ member, size = 28 }) {
  return (
    <span
      className="member-avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        backgroundColor: member.avatarUrl ? undefined : colorForMember(member.id),
      }}
      title={member.name}
    >
      {member.avatarUrl
        ? <img src={member.avatarUrl} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : member.name?.[0]?.toUpperCase()
      }
    </span>
  )
}
