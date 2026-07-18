import { useEffect, useRef, useCallback, useState } from "react";
import { updateConversation, deleteConversation } from "../../api/client";
import useDismissableMenu from "../../hooks/useDismissableMenu";
import { ChatIcon, ChevronIcon, DotsIcon, PlusIcon } from "./icons";
import ConversationThread from "./ConversationThread";
import filobeloReading from "../../assets/mascott/filobelo_reading.svg";

const RAIL_COLLAPSED_WIDTH = 56;

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

function ConversationRowMenu({ conversation, onTogglePin, onToggleArchive, onDelete }) {
    const [isOpen, setIsOpen, menuRef] = useDismissableMenu();
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    useEffect(() => {
        if (!isOpen) setConfirmingDelete(false);
    }, [isOpen]);

    return (
        <div className="conversations-panel__row-menu-wrap" ref={menuRef}>
            <button
                type="button"
                className="conversations-panel__row-menu-trigger"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen((v) => !v);
                }}
                aria-label="Conversation actions"
            >
                <DotsIcon />
            </button>
            {isOpen && (
                <ul className="wd-menu-list" role="menu">
                    <li role="none">
                        <button
                            type="button"
                            role="menuitem"
                            className="wd-menu-item"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsOpen(false);
                                onTogglePin(conversation);
                            }}
                        >
                            {conversation.is_pinned ? "Unpin" : "Pin"}
                        </button>
                    </li>
                    <li role="none">
                        <button
                            type="button"
                            role="menuitem"
                            className="wd-menu-item"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsOpen(false);
                                onToggleArchive(conversation);
                            }}
                        >
                            {conversation.is_archived ? "Unarchive" : "Archive"}
                        </button>
                    </li>
                    <li role="none">
                        {confirmingDelete ? (
                            <button
                                type="button"
                                role="menuitem"
                                className="wd-menu-item wd-menu-item--danger"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsOpen(false);
                                    onDelete(conversation);
                                }}
                            >
                                Confirm delete?
                            </button>
                        ) : (
                            <button
                                type="button"
                                role="menuitem"
                                className="wd-menu-item wd-menu-item--danger"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmingDelete(true);
                                }}
                            >
                                Delete
                            </button>
                        )}
                    </li>
                </ul>
            )}
        </div>
    );
}

export default function ConversationsPanel({
  workspaceId,
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
  width,
  onResize,
  railWidth,
  onRailResize,
  railCollapsed,
  onToggleRailCollapse,
  onClose,
  onToast,
  onComingSoon,
  onConversationUpdated,
  onConversationDeleted,
}) {
    const widthRef = useRef(width);
    useEffect(() => {
        widthRef.current = width;
    }, [width]);

    const railWidthRef = useRef(railWidth);
    useEffect(() => {
        railWidthRef.current = railWidth;
    }, [railWidth]);

    useEffect(() => {
        function onKey(e) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const handleResizeStart = useCallback(
        (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = widthRef.current;
            function onMove(ev) {
                const newW = Math.max(
                    560,
                    Math.min(1000, startW + (startX - ev.clientX)),
                );
                onResize(newW);
            }
            function onUp() {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            }
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        },
        [onResize],
    );

    const handleRailResizeStart = useCallback(
        (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = railWidthRef.current;
            function onMove(ev) {
                const newW = Math.max(
                    200,
                    Math.min(400, startW + (ev.clientX - startX)),
                );
                onRailResize(newW);
            }
            function onUp() {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            }
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        },
        [onRailResize],
    );

    // The Filobelo bot thread is reached via the dedicated "Ask Filobelo"
    // action, not this list - keep it out of the regular conversations rail.
    const workspaceConversations = (conversations ?? []).filter(
        (c) => c.type === "WORKSPACE",
    );
    const botConversations = (conversations ?? []).filter(
        (c) => c.type === "BOT",
    );
    const selectedConversation = [
        ...workspaceConversations,
        ...botConversations,
    ].find((c) => c.id === selectedConversationId);

    // The rail only ever shows conversations matching the currently active
    // mode - "Ask Filobelo" and "Conversations" are separate contexts and
    // should never display each other's history side by side.
    const railConversations = mode === "BOT" ? botConversations : workspaceConversations;

    async function handleTogglePin(conversation) {
        try {
            onConversationUpdated(
                await updateConversation(workspaceId, conversation.id, {
                    is_pinned: !conversation.is_pinned,
                }),
            );
        } catch (err) {
            onToast?.(err.detail ?? "Could not update conversation");
        }
    }

    async function handleToggleArchive(conversation) {
        try {
            onConversationUpdated(
                await updateConversation(workspaceId, conversation.id, {
                    is_archived: !conversation.is_archived,
                }),
            );
        } catch (err) {
            onToast?.(err.detail ?? "Could not update conversation");
        }
    }

    async function handleDeleteConversation(conversation) {
        try {
            await deleteConversation(workspaceId, conversation.id);
            onConversationDeleted(conversation.id);
        } catch (err) {
            onToast?.(err.detail ?? "Could not delete conversation");
        }
    }

    return (
        <>
            <div
                className="slide-over-backdrop"
                onClick={onClose}
                aria-hidden="true"
            />
            <aside
                className="conversations-panel"
                style={{ width }}
                aria-label="Conversations"
            >
                <div
                    className="conversations-panel__resize-handle"
                    onMouseDown={handleResizeStart}
                />

                <div
                    className={`conversations-panel__rail${railCollapsed ? " conversations-panel__rail--collapsed" : ""}${!railCollapsed && !selectedConversation ? " conversations-panel__rail--full-divider" : ""}`}
                    style={{
                        width: railCollapsed ? RAIL_COLLAPSED_WIDTH : railWidth,
                    }}
                >
                    {railCollapsed ? (
                        <button
                            type="button"
                            className="conversations-panel__rail-expand-btn"
                            onClick={onToggleRailCollapse}
                            aria-label="Expand conversation list"
                        >
                            <ChevronIcon
                                style={{ transform: "rotate(180deg)" }}
                            />
                        </button>
                    ) : (
                        <>
                            <div className="conversations-panel__rail-header">
                                <span className="conversations-panel__rail-title">
                                    Conversations
                                </span>
                                <div className="conversations-panel__rail-header-actions">
                                    <button
                                        type="button"
                                        className="conversations-panel__rail-collapse-btn"
                                        onClick={onToggleRailCollapse}
                                        aria-label="Collapse conversation list"
                                    >
                                        <ChevronIcon />
                                    </button>
                                </div>
                            </div>

                            <div className="conversations-panel__rail-list">
                                <button
                                    type="button"
                                    className="conversations-panel__new-chat-btn"
                                    onClick={onStartCreate}
                                >
                                    <PlusIcon />
                                    <span>New chat</span>
                                </button>
                                {railConversations.map((c) => (
                                    <div
                                        key={c.id}
                                        className={`conversations-panel__row${c.id === selectedConversationId ? " conversations-panel__row--active" : ""}`}
                                    >
                                        <button
                                            type="button"
                                            className="conversations-panel__row-select"
                                            onClick={() =>
                                                onSelectConversation(c.id)
                                            }
                                        >
                                            <span className="conversations-panel__row-avatar">
                                                {c.title?.[0]?.toUpperCase()}
                                            </span>
                                            <span className="conversations-panel__row-body">
                                                <span className="conversations-panel__row-top">
                                                    <span className="conversations-panel__row-name">
                                                        {c.is_pinned && (
                                                            <span className="conversations-panel__row-pin">
                                                                📌
                                                            </span>
                                                        )}
                                                        {c.title}
                                                    </span>
                                                    <span className="conversations-panel__row-time">
                                                        {formatConversationTimestamp(
                                                            c.last_message_at,
                                                        )}
                                                    </span>
                                                </span>
                                            </span>
                                        </button>
                                        {(c.creator_id === currentUserId || isAdmin) && (
                                            <ConversationRowMenu
                                                conversation={c}
                                                onTogglePin={handleTogglePin}
                                                onToggleArchive={handleToggleArchive}
                                                onDelete={handleDeleteConversation}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div
                                className="conversations-panel__rail-resize-handle"
                                onMouseDown={handleRailResizeStart}
                            />
                        </>
                    )}
                </div>

                <div className="conversations-panel__main">
                    {conversationsLoading && !conversations ? (
                        <p className="conversations-tab__empty">
                            <ChatIcon />
                            <span>Loading conversations…</span>
                        </p>
                    ) : selectedConversation ? (
                        <ConversationThread
                            workspaceId={workspaceId}
                            conversation={selectedConversation}
                            memberById={memberById}
                            currentUserId={currentUserId}
                            isAdmin={isAdmin}
                            onToast={onToast}
                            onUpdated={onConversationUpdated}
                            onDeleted={onConversationDeleted}
                            onClose={onClose}
                            onComingSoon={onComingSoon}
                            autoFocusTitle={
                                selectedConversation.id ===
                                justCreatedConversationId
                            }
                            onAutoFocusTitleConsumed={onAutoRenameConsumed}
                        />
                    ) : mode === "BOT" ? (
                        <div className="conversations-tab__empty">
                            <img
                                src={filobeloReading}
                                alt=""
                                className="conversation-thread__empty-mascot"
                            />
                            <p className="conversations-panel__ask-away">Ask away!</p>
                        </div>
                    ) : (
                        <div className="conversations-tab__empty">
                            <ChatIcon />
                            <p>
                                {railConversations.length === 0
                                    ? "No conversations yet — start one"
                                    : "Select a conversation to start chatting"}
                            </p>
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
