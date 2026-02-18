;;; allium-mode.el --- Major mode for Allium specifications  -*- lexical-binding: t; -*-

;; Version: 0.1.0
;; Author: Chris Williams
;; Keywords: languages, allium
;; Package-Requires: ((emacs "28.1"))

;;; Commentary:

;; This package provides a major mode for the Allium specification language.

;;; Code:

(defgroup allium nil
  "Support for the Allium specification language."
  :group 'languages)

(defcustom allium-indent-offset 4
  "Indentation offset for Allium blocks."
  :type 'integer
  :group 'allium)

(defcustom allium-lsp-server-command '("allium-lsp" "--stdio")
  "Command to start the Allium Language Server."
  :type '(repeat string)
  :group 'allium)

(defvar allium-mode-syntax-table
  (let ((st (make-syntax-table)))
    ;; Comments: -- to end of line
    (modify-syntax-entry ?- ". 12b" st)
    (modify-syntax-entry ?
 "> b" st)
    ;; Strings: "..."
    (modify-syntax-entry ?" """ st)
    st)
  "Syntax table for `allium-mode'.")

(defvar allium-font-lock-keywords
  (let* ((keywords '("module" "use" "as" "rule" "entity" "external" "value" "enum"
                     "context" "config" "surface" "actor" "default" "variant"
                     "let" "not" "and" "or"))
         (keyword-regexp (regexp-opt keywords 'symbols))
         (clause-keywords '("when" "requires" "ensures" "trigger" "provides" "tags"
                            "guidance" "invariant" "becomes" "related" "exposes"
                            "identified_by" "for"))
         (clause-regexp (concat "\_<" (regexp-opt clause-keywords) ":")))
    `((,keyword-regexp . font-lock-keyword-face)
      (,clause-regexp . font-lock-keyword-face)
      ("\_<\(true\|false\|null\)\_>" . font-lock-constant-face)
      ("\_<[0-9]+\(\.[0-9]+\)?\(?:\.\(?:seconds\|minutes\|hours\|days\)\)?\_>" . font-lock-constant-face)
      ;; Declarations: kind Name
      (,(concat "\_<" (regexp-opt '("rule" "entity" "value" "enum" "surface" "actor" "variant") 'symbols)
                "\s-+\([A-Za-z_][A-Za-z0-9_]*\)")
       2 font-lock-type-face)
      ;; Field assignments: key:
      ("\([A-Za-z_][A-Za-z0-9_]*\):" 1 font-lock-variable-name-face)))
  "Font lock keywords for `allium-mode'.")

(defun allium-indent-line ()
  "Indent current line of Allium code."
  (interactive)
  (let ((savep (point-at-eol))
        (indent (condition-case nil
                    (save-excursion
                      (back-to-indentation)
                      (if (bobp) 0
                        (let ((cur-indent (progn (forward-line -1) (current-indentation))))
                          (save-excursion
                            (back-to-indentation)
                            (cond
                             ((looking-at ".*{\s-*$")
                              (+ cur-indent allium-indent-offset))
                             ((looking-at "^\s-*}")
                              (max 0 (- cur-indent allium-indent-offset)))
                             (t cur-indent))))))
                  (error 0))))
    (indent-line-to indent)
    (when (< (point) savep)
      (goto-char savep))))

;;;###autoload
(define-derived-mode allium-mode prog-mode "Allium"
  "Major mode for editing Allium specifications."
  :syntax-table allium-mode-syntax-table
  (setq-local comment-start "-- ")
  (setq-local comment-end "")
  (setq-local font-lock-defaults '(allium-font-lock-keywords))
  (setq-local indent-line-function 'allium-indent-line))

;;;###autoload
(add-to-list 'auto-mode-alist '("\.allium'" . allium-mode))

(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs
               `(allium-mode . ,allium-lsp-server-command)))

(provide 'allium-mode)
;;; allium-mode.el ends here
