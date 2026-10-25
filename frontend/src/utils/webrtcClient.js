/**
 * WebRTC Voice Agent Client for RailVoice
 * Connects browser microphone directly to FastAPI aiortc backend:
 * Browser Mic ➔ WebRTC Audio Track ➔ Deepgram Nova-2 Live STT ➔ Tool Calling ➔ LLM ➔ Deepgram TTS ➔ WebRTC ➔ Browser Speaker
 */

export class WebRTCVoiceClient {
  constructor({ onMessage, onTrack, onStateChange, apiBaseUrl }) {
    this.onMessage = onMessage || (() => {});
    this.onTrack = onTrack || (() => {});
    this.onStateChange = onStateChange || (() => {});
    this.apiBaseUrl = apiBaseUrl || 'http://localhost:8000';

    this.pc = null;
    this.localStream = null;
    this.dataChannel = null;
    this.remoteAudio = null;
    this.sessionId = `webrtc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.isConnected = false;
  }

  async start(token = null) {
    try {
      this.onStateChange('CONNECTING');

      // 1. Prepare dedicated hidden audio element attached to document
      if (!this.remoteAudio) {
        this.remoteAudio = document.createElement('audio');
        this.remoteAudio.autoplay = true;
        this.remoteAudio.setAttribute('playsinline', 'true');
        this.remoteAudio.style.display = 'none';
        document.body.appendChild(this.remoteAudio);
      }

      // 2. Request microphone access with echo cancellation & noise suppression
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        }
      });

      // 3. Create RTCPeerConnection with standard public STUN servers
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      // 4. Add local microphone audio track to WebRTC connection
      this.localStream.getTracks().forEach((track) => {
        this.pc.addTrack(track, this.localStream);
      });

      // 5. Create WebRTC DataChannel for low-latency live events
      this.dataChannel = this.pc.createDataChannel('railvoice-events');
      this.setupDataChannel(this.dataChannel);

      // 6. Handle incoming agent audio track from backend
      this.pc.ontrack = (event) => {
        if (event.track.kind === 'audio') {
          console.log('[WebRTC] Received agent audio track');
          const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
          if (this.remoteAudio) {
            this.remoteAudio.srcObject = stream;
            this.remoteAudio.play().catch((err) => {
              console.warn('[WebRTC] Autoplay requires user interaction:', err);
            });
          }
          this.onTrack(stream);
        }
      };

      // 7. Handle ICE connection state changes
      this.pc.onconnectionstatechange = () => {
        const state = this.pc.connectionState;
        console.log('[WebRTC] Connection state changed:', state);
        if (state === 'connected') {
          this.isConnected = true;
          this.onStateChange('CONNECTED');
        } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          this.isConnected = false;
          this.onStateChange('DISCONNECTED');
        }
      };

      // 8. Handle ICE Candidate exchange
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          fetch(`${this.apiBaseUrl}/api/webrtc/ice-candidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: this.sessionId,
              candidate: event.candidate.toJSON()
            })
          }).catch((err) => console.debug('[WebRTC] ICE candidate forward error:', err));
        }
      };

      // 9. Create WebRTC SDP Offer
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await this.pc.setLocalDescription(offer);

      // Wait briefly for initial ICE gathering
      await new Promise((resolve) => {
        if (this.pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          const checkState = () => {
            if (this.pc.iceGatheringState === 'complete') {
              this.pc.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          this.pc.addEventListener('icegatheringstatechange', checkState);
          setTimeout(resolve, 400);
        }
      });

      // 10. Send SDP Offer to FastAPI backend
      const response = await fetch(`${this.apiBaseUrl}/api/webrtc/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: this.pc.localDescription.sdp,
          type: this.pc.localDescription.type,
          session_id: this.sessionId,
          token: token || null
        })
      });

      if (!response.ok) {
        throw new Error(`WebRTC negotiation failed with HTTP ${response.status}`);
      }

      const answer = await response.json();

      // 11. Apply Remote SDP Answer
      await this.pc.setRemoteDescription(
        new RTCSessionDescription({
          type: answer.type,
          sdp: answer.sdp
        })
      );

      console.log('[WebRTC] Voice call pipeline established successfully!');
      return true;
    } catch (err) {
      console.error('[WebRTC] Setup failed:', err);
      this.onStateChange('FAILED');
      this.stop();
      throw err;
    }
  }

  setupDataChannel(channel) {
    channel.onopen = () => {
      console.log('[WebRTC] DataChannel open');
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch (e) {
        console.error('[WebRTC] DataChannel parse error:', e);
      }
    };

    channel.onerror = (err) => {
      console.warn('[WebRTC] DataChannel error:', err);
    };

    channel.onclose = () => {
      console.log('[WebRTC] DataChannel closed');
    };
  }

  sendInterrupt() {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ type: 'user_interrupt' }));
    }
  }

  sendTextPrompt(text) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ type: 'text_prompt', text }));
    }
  }

  setMute(isMuted) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  }

  stop() {
    this.isConnected = false;
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify({ type: 'end_call' }));
        this.dataChannel.close();
      } catch (e) {}
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.remoteAudio) {
      try {
        this.remoteAudio.pause();
        this.remoteAudio.srcObject = null;
        if (this.remoteAudio.parentNode) {
          this.remoteAudio.parentNode.removeChild(this.remoteAudio);
        }
      } catch (e) {}
      this.remoteAudio = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch (e) {}
      this.pc = null;
    }
    this.onStateChange('ENDED');
  }
}
