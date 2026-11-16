import { useEffect, useState } from "react";
import { createConversation } from "../../api/client";
import { keys, writeCache } from "../../api/queryClient";
import ConversationThread, {
    ChatHeader,
    Composer,
    MemberStack,
    NewChatButton,
} from "./ConversationThread";
import { BotMark } from "./MessageBubble";
import { SparkleIcon } from "./icons";
import "./ConversationsPanel.css";

// One floating panel, two modes: "BOT" (Ask Filobelo, private to you) and
// "WORKSPACE" (chat shared with every member). It is a single column in
// both sizes: the conversation list and an open thread swap places, with a
// back button in the thread header. Expanding only makes it wider.
//
// Views: list | thread | start (Filobelo: type a first question) |
// empty (workspace chat: no conversations yet) | loading.

const TITLE_MAX = 60;

function formatConversationTimestamp(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
        });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

// A new Filobelo chat is named after the question that started it, cut at a
// word boundary when it is long.
function titleFromQuestion(text) {
    const flat = text.replace(/\s+/g, " ").trim();
    if (flat.length <= TITLE_MAX) return flat;
    const cut = flat.slice(0, TITLE_MAX);
    const space = cut.lastIndexOf(" ");
    const base = space > TITLE_MAX / 2 ? cut.slice(0, space) : cut;
    return `${base.replace(/[\s,.;:!?-]+$/, "")}…`;
}

function ConversationRow({ conversation, isBot, active, onSelect }) {
    return (
        <li>
            <button
                type="button"
                className={`chat-list__row${active ? " chat-list__row--active" : ""}${conversation.is_archived ? " chat-list__row--archived" : ""}`}
                onClick={() => onSelect(conversation.id)}
            >
                <span
                    className={`chat-list__icon${isBot ? " chat-list__icon--bot" : ""}`}
                    aria-hidden="true"
                >
                    {isBot ? <SparkleIcon size={15} /> : "#"}
                </span>
                <span className="chat-list__text">
                    <span className="chat-list__top">
                        <span className="chat-list__title">
                            {conversation.title}
                        </span>
                        <span className="chat-list__time">
                            {formatConversationTimestamp(
                                conversation.last_message_at,
                            )}
                        </span>
                    </span>
                    <span className="chat-list__snippet">
                        {conversation.last_message || "No messages yet"}
                    </span>
                </span>
            </button>
        </li>
    );
}

export default function ConversationsPanel({
    workspaceId,
    workspaceTitle,
    conversations,
    mode,
    conversationsLoading,
    selectedConversationId,
    onSelectConversation,
    onStartCreate,
    justCreatedConversationId,
    onAutoRenameConsumed,
    memberById,
    currentUserId,
    isAdmin,
    expanded,
    onToggleExpanded,
    onClose,
    onToast,
    onConversationUpdated,
    onConversationDeleted,
}) {
    // Filobelo's start screen was asked for ("New chat"), even though there
    // are earlier chats to list.
    const [composing, setComposing] = useState(false);
    const [startDraft, setStartDraft] = useState("");
    const [starting, setStarting] = useState(false);
    // The question typed on the start screen, handed to the new chat's
    // thread to send: { conversationId, text }.
    const [firstMessage, setFirstMessage] = useState(null);
    // The thread you came back from, highlighted in the list.
    const [lastViewedId, setLastViewedId] = useState(null);

    useEffect(() => {
        setComposing(false);
    }, [mode, workspaceId]);

    useEffect(() => {
        function onKey(e) {
            if (e.key !== "Escape") return;
            // An open menu or confirm dialog gets the Escape, not the panel.
            if (document.querySelector('[role="menu"], [role="alertdialog"]'))
                return;
            onClose();
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const isBot = mode === "BOT";
    const all = conversations ?? [];
    const list = all.filter((c) => c.type === (isBot ? "BOT" : "WORKSPACE"));
    const selected = all.find((c) => c.id === selectedConversationId);
    const members = [...memberById.values()];
    const memberCount = memberById.size;
    const teamSubtitle = `${workspaceTitle} · ${memberCount} member${memberCount === 1 ? "" : "s"}`;

    let view;
    if (selected) view = "thread";
    else if (!conversations) view = "loading";
    else if (isBot && (composing || list.length === 0)) view = "start";
    else if (list.length === 0) view = "empty";
    else view = "list";

    function handleBack() {
        setLastViewedId(selectedConversationId);
        setComposing(false);
        onSelectConversation(null);
    }

    function handleNew() {
        if (isBot) {
            onSelectConversation(null);
            setComposing(true);
        } else {
            onStartCreate();
        }
    }

    async function handleStartSend() {
        const text = startDraft.trim();
        if (!text || starting) return;
        setStarting(true);
        try {
            const created = await createConversation(workspaceId, {
                title: titleFromQuestion(text),
                type: "BOT",
            });
            writeCache(keys.conversations(workspaceId), (prev) => [
                created,
                ...(prev ?? []),
            ]);
            setFirstMessage({ conversationId: created.id, text });
            setStartDraft("");
            setComposing(false);
            onSelectConversation(created.id);
        } catch (err) {
            onToast?.(err.detail ?? "Could not start a chat");
        } finally {
            setStarting(false);
        }
    }

    const listMark = isBot ? (
        <BotMark size={30} solid />
    ) : (
        <MemberStack members={members} />
    );
    const listTitle = isBot ? "Filobelo chats" : "Workspace chat";
    const listSubtitle = isBot ? "Private to you" : teamSubtitle;
    const headerProps = { expanded, onToggleExpanded, onClose };

    function renderList() {
        const groups = [
            {
                label: "Pinned",
                items: list.filter((c) => c.is_pinned && !c.is_archived),
            },
            {
                label: isBot ? "Chats" : "Conversations",
                items: list.filter((c) => !c.is_pinned && !c.is_archived),
            },
            { label: "Archived", items: list.filter((c) => c.is_archived) },
        ].filter((g) => g.items.length > 0);

        return (
            <div className="chat-list">
                {groups.map((g) => (
                    <section key={g.label} className="chat-list__group">
                        <h3 className="ui-caps chat-list__label">{g.label}</h3>
                        <ul className="chat-list__rows">
                            {g.items.map((c) => (
                                <ConversationRow
                                    key={c.id}
                                    conversation={c}
                                    isBot={isBot}
                                    active={c.id === lastViewedId}
                                    onSelect={onSelectConversation}
                                />
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        );
    }

    let content;
    if (view === "thread") {
        const threadIsBot = selected.type === "BOT";
        content = (
            <ConversationThread
                workspaceId={workspaceId}
                workspaceTitle={workspaceTitle}
                conversation={selected}
                memberById={memberById}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onToast={onToast}
                onUpdated={onConversationUpdated}
                onDeleted={onConversationDeleted}
                onClose={onClose}
                onBack={handleBack}
                onNewChat={threadIsBot ? handleNew : undefined}
                expanded={expanded}
                onToggleExpanded={onToggleExpanded}
                autoFocusTitle={selected.id === justCreatedConversationId}
                onAutoFocusTitleConsumed={onAutoRenameConsumed}
                initialMessage={
                    firstMessage?.conversationId === selected.id
                        ? firstMessage.text
                        : null
                }
                onInitialMessageConsumed={() => setFirstMessage(null)}
            />
        );
    } else if (view === "start") {
        content = (
            <>
                <ChatHeader
                    {...headerProps}
                    onBack={
                        list.length > 0 ? () => setComposing(false) : undefined
                    }
                    backLabel="All Filobelo chats"
                    mark={<BotMark size={30} solid />}
                    title="Ask Filobelo"
                    subtitle={workspaceTitle}
                />
                <div className="chat-start">
                    <BotMark size={52} />
                    <div className="chat-start__text">
                        <h2 className="chat-start__title">
                            What can I help with?
                        </h2>
                        <p className="chat-start__lead">
                            I can read the tasks, notes and links in{" "}
                            {workspaceTitle}. Our chats are private to you.
                        </p>
                    </div>
                </div>
                <Composer
                    value={startDraft}
                    onChange={setStartDraft}
                    onSend={handleStartSend}
                    canSend={!starting && Boolean(startDraft.trim())}
                    placeholder="Ask about this workspace…"
                    hint="Filobelo can make mistakes"
                    autoFocus
                />
            </>
        );
    } else {
        content = (
            <>
                <ChatHeader
                    {...headerProps}
                    mark={listMark}
                    title={listTitle}
                    subtitle={listSubtitle}
                    actions={
                        view !== "loading" && (
                            <NewChatButton
                                label={isBot ? "New chat" : "New conversation"}
                                onClick={handleNew}
                            />
                        )
                    }
                />
                {view === "loading" && (
                    <p className="chat-panel__note">
                        {conversationsLoading
                            ? "Loading conversations…"
                            : "Could not load conversations."}
                    </p>
                )}
                {view === "list" && renderList()}
                {view === "empty" && (
                    <div className="chat-empty">
                        <MemberStack members={members} size={44} />
                        <div className="chat-empty__text">
                            <h2 className="chat-empty__title">
                                Start the conversation
                            </h2>
                            <p className="chat-empty__lead">
                                Conversations here are shared with everyone in{" "}
                                {workspaceTitle}.
                                {memberCount === 1 &&
                                    " You're the only member so far."}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="ui-btn ui-btn--primary ui-btn--sm"
                            onClick={onStartCreate}
                        >
                            New conversation
                        </button>
                    </div>
                )}
            </>
        );
    }

    return (
        <aside
            className={`conversations-panel${expanded ? " conversations-panel--expanded" : ""}`}
            aria-label={isBot ? "Ask Filobelo" : "Workspace chat"}
        >
            {content}
        </aside>
    );
}
