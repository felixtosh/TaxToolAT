"use client";

import { useState, useCallback } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  collection,
  addDoc,
  Timestamp,
  doc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { storage, db } from "@/lib/firebase/config";
import { Receipt } from "@/types/receipt";

const MOCK_USER_ID = "dev-user-123"; // Mock user for development

interface UploadState {
  progress: number;
  isUploading: boolean;
  error: Error | null;
}

// Mock AI suggestions for demo
const MOCK_AI_SUGGESTIONS = [
  "Office supplies for business operations",
  "Software subscription - business expense",
  "Travel expense - client meeting",
  "Marketing materials",
  "Professional services fee",
  "Equipment purchase - business use",
];

export function useFileUpload() {
  const [uploadState, setUploadState] = useState<UploadState>({
    progress: 0,
    isUploading: false,
    error: null,
  });

  const uploadFile = useCallback(
    async (file: File, transactionId: string): Promise<Receipt | null> => {
      setUploadState({ progress: 0, isUploading: true, error: null });

      try {
        // Generate unique filename
        const timestamp = Date.now();
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const storagePath = `receipts/${MOCK_USER_ID}/${transactionId}/${timestamp}_${sanitizedName}`;
        const storageRef = ref(storage, storagePath);

        // Upload with progress tracking
        const uploadTask = uploadBytesResumable(storageRef, file);

        return new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress =
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadState((s) => ({ ...s, progress }));
            },
            (error) => {
              setUploadState({ progress: 0, isUploading: false, error });
              reject(error);
            },
            async () => {
              try {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

                // Generate mock AI suggestion
                const aiSuggestedDescription =
                  MOCK_AI_SUGGESTIONS[
                    Math.floor(Math.random() * MOCK_AI_SUGGESTIONS.length)
                  ];

                // Create receipt document
                const receiptData = {
                  transactionId,
                  fileName: file.name,
                  fileType: file.type,
                  fileSize: file.size,
                  storagePath,
                  downloadUrl,
                  aiSuggestedDescription,
                  uploadedAt: Timestamp.now(),
                  userId: MOCK_USER_ID,
                  createdAt: Timestamp.now(),
                };

                const receiptRef = await addDoc(
                  collection(db, "receipts"),
                  receiptData
                );

                // Update transaction with receipt reference
                const transactionRef = doc(db, "transactions", transactionId);
                await updateDoc(transactionRef, {
                  receiptIds: arrayUnion(receiptRef.id),
                  updatedAt: Timestamp.now(),
                });

                const receipt: Receipt = {
                  id: receiptRef.id,
                  ...receiptData,
                };

                setUploadState({ progress: 100, isUploading: false, error: null });
                resolve(receipt);
              } catch (error) {
                setUploadState({
                  progress: 0,
                  isUploading: false,
                  error: error as Error,
                });
                reject(error);
              }
            }
          );
        });
      } catch (error) {
        setUploadState({
          progress: 0,
          isUploading: false,
          error: error as Error,
        });
        return null;
      }
    },
    []
  );

  return {
    uploadFile,
    ...uploadState,
  };
}
