// Global variables
let isListening = false;
let isSpeaking = false;
let recognition = null;
let voiceEnabled = true;
let messageIndex = [];

class ChatManager {
    constructor() {
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.messagesArea = document.getElementById('messagesArea');
        this.modelSelect = document.getElementById('modelSelect');
        this.currentModel = 'open-mistral-nemo';                          
        this.welcomeSection = document.getElementById('welcomeSection');
        this.isFirstMessage = true;
        this.uploadBtn = document.getElementById('uploadBtn');
        this.fileInput = document.getElementById('fileInput');

        this.setupEventListeners(); 
        this.initializeUI();
        this.setupFileUpload();
    }

    initializeUI() {
        const chatSearchInput = document.getElementById('chatSearch');
        if (chatSearchInput) {
            chatSearchInput.addEventListener('input', debounce((e) => this.searchMessages(e), 300));
        }

        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            this.initSpeechRecognition();
        }
    }

    setupEventListeners() {
        this.sendBtn.addEventListener('click', () => {
            try {
                this.sendMessage();
            } catch (error) {
                console.error('Send button error:', error);
                this.showError('Failed to send message');
            }
        });

        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                try {
                    this.sendMessage();
                } catch (error) {
                    console.error('Enter key error:', error);
                    this.showError('Failed to send message');
                }
            }
        });

        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = `${this.messageInput.scrollHeight}px`;
        });

        if (this.modelSelect) {
            this.modelSelect.addEventListener('change', (e) => {
                this.currentModel = e.target.value;
                this.addSystemMessage(`Switched to ${this.currentModel} model`);
            });
        }
    }

    setupFileUpload() {
        this.uploadBtn.addEventListener('click', () => {
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const maxSize = 10 * 1024 * 1024; // 10MB
            if (file.size > maxSize) {
                this.showError('File size exceeds 10MB limit');
                this.fileInput.value = '';
                return;
            }

            try {
                this.setInputState(false);
                this.uploadBtn.classList.add('uploading');

                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('upload.php', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) throw new Error(`Server error: ${response.status}`);

                const data = await response.json();

                if (!data.success) throw new Error(data.error || 'Upload failed');

                this.addMessageToChat(`Uploaded file: ${file.name}`, 'user');

                if (data.processedContent) {
                    this.addMessageToChat(data.processedContent, 'ai');
                }
            } catch (error) {
                console.error('Upload error:', error);
                this.showError(`Upload error: ${error.message}`);
            } finally {
                this.setInputState(true);
                this.uploadBtn.classList.remove('uploading');
                this.fileInput.value = '';
            }
        });
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        try {
            if (this.isFirstMessage && this.welcomeSection) {
                this.welcomeSection.style.opacity = '0';
                this.welcomeSection.style.transform = 'translateY(-20px)';
                this.welcomeSection.style.transition = 'all 0.3s ease';
                setTimeout(() => {
                    this.welcomeSection.style.display = 'none';
                }, 300);
                this.isFirstMessage = false;
            }

            this.setInputState(false);
            this.addMessageToChat(message, 'user');
            this.messageInput.value = '';
            this.messageInput.style.height = 'auto';

            this.showTypingIndicator();
            const response = await this.fetchAIResponse(message);
            this.hideTypingIndicator();

            if (response && response.success && response.response) {
                this.addMessageToChat(response.response, 'ai');
            } else {
                throw new Error(response.error || 'Failed to get response');
            }
        } catch (error) {
            console.error('Error:', error);
            this.showError(`Error: ${error.message}`);
        } finally {
            this.setInputState(true);
        }
    }



//                            ==================================================

//                                     BACKEND API CALL TO MYCHAT.PHP

//                            ==================================================


    async fetchAIResponse(message) {
        try {
            const response = await fetch('mychat.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    model: this.currentModel
                })
            });

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server returned non-JSON response');
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            if (!data) {
                throw new Error('Empty response from server');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw new Error(`Request failed: ${error.message}`);
        }
    }

    setInputState(enabled) {
        this.messageInput.disabled = !enabled;
        this.sendBtn.disabled = !enabled;
        if (this.modelSelect) {
            this.modelSelect.disabled = !enabled;
        }
        if (this.uploadBtn) {
            this.uploadBtn.disabled = !enabled;
        }
    }
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    addMessageToChat(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message-wrapper ${type}-message`;
 
        const formattedText = this.processMessageText(text);                        
        
        messageDiv.innerHTML = `
            <div class="message-container">
                <div class="message-content">${formattedText}</div>
            </div>
        `;
        
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(10px)';
        this.messagesArea.appendChild(messageDiv);
        
        requestAnimationFrame(() => {
            messageDiv.style.transition = 'all 0.3s ease';
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        });
        
        this.scrollToBottom();
    }

    processMessageText(text) {
        const codeBlockPlaceholder = "__CODE_BLOCK_PLACEHOLDER__";
        const codeBlocks = [];

        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;

        let textWithoutCodeBlocks = text.replace(codeBlockRegex, (match, language, code) => {
            const lang = language || 'text';
            const actualCode = code.trim();

            codeBlocks.push(`
                <div class="code-block">
                    <div class="code-header">
                        <span class="code-language">${lang.toUpperCase()}</span>
                        <button class="copy-btn" onclick="copyCode(this)">
                            <i class="bi bi-clipboard"></i> Copy
                        </button>
                    </div>
                    <pre><code class="language-${lang}">${this.escapeHtml(actualCode)}</code></pre>
                </div>
            `);
            return `\n\n${codeBlockPlaceholder}\n\n`;
        });

        let parts = textWithoutCodeBlocks.split(/[ \t]*\n[ \t]*\n+/).filter(p => p.trim());        

        let finalFormattedHtmlParts = parts.map(part => {
            if (part === codeBlockPlaceholder) {
                return codeBlockPlaceholder;
            }

            let formattedPart = this.formatResponseStructure(part);

            if (formattedPart.trim() !== '' && !formattedPart.trim().match(/^<(div|h3|code|span|strong|ul|li)/) && !/<\/?.+?>/.test(formattedPart)) {
                 return `<p class="response-paragraph">${formattedPart.trim()}</p>`;
            }

            return formattedPart;
        });

        let finalFormattedHtml = finalFormattedHtmlParts.join('\n');

        let codeIndex = 0;
        finalFormattedHtml = finalFormattedHtml.replace(new RegExp(codeBlockPlaceholder, 'g'), () => {
            return codeBlocks[codeIndex++];
        });

        return finalFormattedHtml;
    }

    formatResponseStructure(text) {
        let formattedText = text;

        const numberedStepRegex = /^(\d+)\.\s+(.+)$/gm;

        const lines = formattedText.split('\n').filter(line => line.trim() !== '');
        const allNonEmptyLinesMatchNumberedStep = lines.every(line => line.match(/^\d+\.\s+/));
        
        if (allNonEmptyLinesMatchNumberedStep && lines.length > 0) {
             formattedText = formattedText.replace(numberedStepRegex, '<div class="numbered-item"><span class="number">$1</span><span class="content">$2</span></div>');
             return formattedText;
        }
        
        formattedText = formattedText.replace(/^##\s+(.+)$/gm, '<h3 class="response-header">$1</h3>');
        formattedText = formattedText.replace(/\*\*(.+?)\*\*/g, '<strong class="highlight">$1</strong>');
        
        formattedText = formattedText.replace(/(🔥|⚡|💡|🚀|✅|❌|⭐|🎯|📝|💻|🔧|🎨|📊|🔍|🌟|🎪|🎭|��|🔨|⚙️|🏗️|📋|📌|🎯|💎)/g, '<span class="emoji">$1</span>');
        
        formattedText = formattedText.replace(/^Step\s+(\d+):\s*(.+)$/gmi, '<div class="step-item"><span class="step-number">Step $1</span><span class="step-content">$2</span></div>');
        formattedText = formattedText.replace(/^(\d+)\.\s*Step:\s*(.+)$/gmi, '<div class="step-item"><span class="step-number">Step $1</span><span class="step-content">$2</span></div>');
        formattedText = formattedText.replace(/^Phase\s+(\d+):\s*(.+)$/gmi, '<div class="step-item phase"><span class="step-number">Phase $1</span><span class="step-content">$2</span></div>');
        
        formattedText = formattedText.replace(/^- \[ \]\s+(.+)$/gm, '<div class="task-item unchecked"><i class="bi bi-square"></i><span class="task-content">$1</span></div>');
        formattedText = formattedText.replace(/^- \[x\]\s+(.+)$/gm, '<div class="task-item checked"><i class="bi bi-check-square-fill"></i><span class="task-content">$1</span></div>');
        
        formattedText = formattedText.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');    

        formattedText = formattedText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="response-link">$1</a>');
        
        return formattedText;
    }

    addSystemMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'system-message';
        messageDiv.innerHTML = `
            <div class="message-content">
                <i class="bi bi-info-circle me-2"></i>
                ${this.escapeHtml(text)}
            </div>
        `;
        this.messagesArea.appendChild(messageDiv);
        this.scrollToBottom();
    }

    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        `;
        this.messagesArea.appendChild(indicator);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const indicator = this.messagesArea.querySelector('.typing-indicator');
        if (indicator) indicator.remove();
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <div class="error-content">
                <i class="bi bi-exclamation-triangle me-2"></i>        
                ${this.escapeHtml(message)}
            </div>
        `;
        this.messagesArea.appendChild(errorDiv);
        this.scrollToBottom();
        setTimeout(() => {
            errorDiv.classList.add('fade-out');
            setTimeout(() => errorDiv.remove(), 300);
        }, 5000);
    }

    scrollToBottom() {
        this.messagesArea.scrollTop = this.messagesArea.scrollHeight;
    }

    getFormattedTime() {
        return new Date().toLocaleTimeString([], { 
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    searchMessages(e) {
        const searchTerm = e.target.value.toLowerCase();
        const messages = this.messagesArea.querySelectorAll('.message-wrapper');
        messages.forEach(message => {
            const messageText = message.textContent.toLowerCase();
            message.style.display = messageText.includes(searchTerm) ? 'flex' : 'none';
        });
    }

    initSpeechRecognition() {
        try {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.log('Speech recognition not supported in this browser');
                return;
            }

            recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                isListening = true;
                console.log('Speech recognition started');
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                this.messageInput.value = transcript;
                this.messageInput.focus();
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                isListening = false;
            };

            recognition.onend = () => {
                isListening = false;
                console.log('Speech recognition ended');
            };

        } catch (error) {
            console.error('Error initializing speech recognition:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ChatManager();
});

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function copyCode(button) {
    const pre = button.closest('.code-block').querySelector('pre');
    const code = pre.textContent;  
    navigator.clipboard.writeText(code).then(() => {
        const originalIcon = button.innerHTML;
        button.innerHTML = '<i class="bi bi-check"></i>';
        setTimeout(() => {
            button.innerHTML = originalIcon;
        }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}
