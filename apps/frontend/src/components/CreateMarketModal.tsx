import React, { useState } from "react";
import { createMarket } from "../api";

interface CreateMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateMarketModal: React.FC<CreateMarketModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resolutionDescription, setResolutionDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await createMarket(title, description, resolutionDescription);
      setTitle("");
      setDescription("");
      setResolutionDescription("");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to create market");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Create New Prediction Market</h3>
          <button className="btn-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="feedback-alert error">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Question / Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Will Bitcoin reach $150,000 in 2026?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-input"
            />
          </div>

          <div className="form-group">
            <label>Description & Context</label>
            <textarea
              required
              rows={3}
              placeholder="Provide background context for the prediction market..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-input"
            />
          </div>

          <div className="form-group">
            <label>Resolution Criteria</label>
            <input
              type="text"
              required
              placeholder="e.g. Resolves to YES if Binance/CoinGecko BTC price >= $150k"
              value={resolutionDescription}
              onChange={(e) => setResolutionDescription(e.target.value)}
              className="text-input"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Creating..." : "Create Market"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
