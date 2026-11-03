import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bookmark,
  Plus,
  GitMerge,
  Trash2,
  Edit2,
  BarChart2,
  ArrowRight,
  AlertCircle,
  Check,
} from "lucide-react";
import { api, ReadingListDetail, UserProfile } from "@/api/client";

interface ReadingListsPageProps {
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
}

export const ReadingListsPage: React.FC<ReadingListsPageProps> = ({ currentUser, onOpenAuth }) => {
  const navigate = useNavigate();
  const [lists, setLists] = useState<ReadingListDetail[]>([]);
  const [loading, setLoading] = useState(true);

  // Create list modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");

  // Merge modal (UC-7.6)
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [mergedListName, setMergedListName] = useState("");
  const [deleteSources, setDeleteSources] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const fetchLists = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const data = await api.getReadingLists();
      setLists(data.items || []);
    } catch {
      setLists([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchLists();
    }
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 rounded bg-zinc-900 border border-zinc-800 text-center space-y-4">
        <Bookmark className="w-10 h-10 text-emerald-400 mx-auto" />
        <h2 className="text-base font-bold font-mono text-zinc-100">DANH SÁCH ĐỌC CÁ NHÂN</h2>
        <p className="text-xs text-zinc-400">
          Vui lòng đăng nhập để tạo, quản lý và phân tích các danh sách truyện của riêng bạn.
        </p>
        <button
          onClick={onOpenAuth}
          className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-bold text-xs"
        >
          Đăng Nhập Ngay
        </button>
      </div>
    );
  }

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    try {
      await api.createReadingList({ name: newListName.trim(), description: newListDesc.trim() });
      setShowCreateModal(false);
      setNewListName("");
      setNewListDesc("");
      fetchLists();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleMergeLists = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSources.length < 2 || !mergedListName.trim()) return;
    setMergeError(null);
    try {
      await api.mergeReadingLists({
        source_list_ids: selectedSources,
        new_list_name: mergedListName.trim(),
        delete_source_lists: deleteSources,
        confirm_empty: confirmEmpty,
      });
      setShowMergeModal(false);
      setSelectedSources([]);
      setMergedListName("");
      fetchLists();
    } catch (err: any) {
      if (err.message && err.message.includes("SOURCE_LISTS_EMPTY_CONFIRMATION_REQUIRED")) {
        setConfirmEmpty(true);
        setMergeError("Tất cả danh sách nguồn đều trống. Hãy tick xác nhận nếu bạn vẫn muốn tạo danh sách gộp rỗng.");
      } else {
        setMergeError(err.message);
      }
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa danh sách này? (Truyện gốc vẫn an toàn)")) return;
    try {
      await api.deleteReadingList(listId);
      fetchLists();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-lg font-bold font-mono text-zinc-100 tracking-tight">DANH SÁCH ĐỌC CÁ NHÂN</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Quản lý riêng tư, gộp danh sách khử trùng lặp và thống kê thể loại
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMergeModal(true)}
            disabled={lists.length < 2}
            className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-mono text-zinc-300 flex items-center gap-1.5 transition-colors disabled:opacity-40"
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span>Gộp Danh Sách</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-semibold text-xs flex items-center gap-1.5 transition-colors shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tạo List Mới</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-zinc-900 rounded border border-zinc-800" />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <div className="p-12 text-center rounded bg-zinc-900 border border-zinc-800 space-y-3">
          <Bookmark className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-sm font-semibold text-zinc-300">Bạn chưa tạo danh sách đọc nào.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded bg-emerald-500 text-zinc-950 font-mono text-xs font-semibold"
          >
            Tạo Danh Sách Đầu Tiên
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {lists.map((l) => (
            <div
              key={l.list_id}
              className="p-4 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                    {l.visibility}
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">{l.manga_count} truyện</span>
                </div>
                <h3 className="text-sm font-bold text-zinc-100 font-mono">{l.name}</h3>
                {l.description && (
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{l.description}</p>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs font-mono">
                <button
                  onClick={() => handleDeleteList(l.list_id)}
                  className="text-zinc-500 hover:text-rose-400 transition-colors p-1"
                  title="Xóa list"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <Link
                  to={`/lists/${l.list_id}`}
                  className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                >
                  <span>Xem Chi Tiết</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create List Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form onSubmit={handleCreateList} className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded p-6 space-y-4 font-mono text-xs">
            <h3 className="text-sm font-bold text-zinc-100">TẠO DANH SÁCH ĐỌC MỚI</h3>
            <div>
              <label className="block text-zinc-400 mb-1 text-[11px]">TÊN DANH SÁCH (BẮT BUỘC)</label>
              <input
                type="text"
                required
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Vd: Shounen Hay Nhất, Đọc Cuối Tuần..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1 text-[11px]">MÔ TẢ (TÙY CHỌN)</label>
              <textarea
                rows={2}
                value={newListDesc}
                onChange={(e) => setNewListDesc(e.target.value)}
                placeholder="Ghi chú thêm về bộ sưu tập này..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                HỦY
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold"
              >
                TẠO DANH SÁCH
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Merge Lists Modal (UC-7.6) */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form onSubmit={handleMergeLists} className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded p-6 space-y-4 font-mono text-xs">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-emerald-400" />
              <span>GỘP CÁC DANH SÁCH (KHỬ TRÙNG LẶP)</span>
            </h3>

            {mergeError && (
              <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
                {mergeError}
              </div>
            )}

            <div>
              <label className="block text-zinc-400 mb-1.5 text-[11px]">CHỌN ÍT NHẤT 2 DANH SÁCH NGUỒN</label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {lists.map((l) => (
                  <label key={l.list_id} className="flex items-center gap-2 p-2 rounded bg-zinc-950 border border-zinc-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSources.includes(l.list_id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedSources([...selectedSources, l.list_id]);
                        else setSelectedSources(selectedSources.filter((id) => id !== l.list_id));
                      }}
                      className="rounded border-zinc-700 text-emerald-500"
                    />
                    <span className="truncate">{l.name}</span>
                    <span className="text-[10px] text-zinc-500 ml-auto font-mono">({l.manga_count} truyện)</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 text-[11px]">TÊN DANH SÁCH GỘP MỚI</label>
              <input
                type="text"
                required
                value={mergedListName}
                onChange={(e) => setMergedListName(e.target.value)}
                placeholder="Vd: Master Collection 2026..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200"
              />
            </div>

            <div className="space-y-2 pt-1 border-t border-zinc-800">
              <label className="flex items-center gap-2 cursor-pointer text-zinc-400">
                <input
                  type="checkbox"
                  checked={deleteSources}
                  onChange={(e) => setDeleteSources(e.target.checked)}
                  className="rounded border-zinc-700 text-rose-500"
                />
                <span>Xóa các danh sách nguồn sau khi gộp</span>
              </label>

              {confirmEmpty && (
                <label className="flex items-center gap-2 cursor-pointer text-amber-400 font-bold">
                  <input
                    type="checkbox"
                    checked={confirmEmpty}
                    onChange={(e) => setConfirmEmpty(e.target.checked)}
                    className="rounded border-zinc-700 text-amber-500"
                  />
                  <span>Xác nhận: Tiếp tục tạo dù các danh sách nguồn rỗng</span>
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowMergeModal(false)}
                className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                HỦY
              </button>
              <button
                type="submit"
                disabled={selectedSources.length < 2 || !mergedListName.trim()}
                className="px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold disabled:opacity-40"
              >
                THỰC HIỆN GỘP
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

