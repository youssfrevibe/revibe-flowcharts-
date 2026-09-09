import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface CanvasState {
  selectedIds: string[];
  selectedConn: string | null;
  setSelected: (ids: string[]) => void;
  setSelectedConn: (id: string | null) => void;
}

export const useCanvasStore = create<CanvasState>()(
  immer(set => ({
    selectedIds: [],
    selectedConn: null,
    setSelected: ids => {
      set(state => {
        state.selectedIds = ids;
      });
    },
    setSelectedConn: id => {
      set(state => {
        state.selectedConn = id;
      });
    },
  }))
);
