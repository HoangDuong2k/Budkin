// Bụi lơ lửng trong luồng sáng đèn bàn ở phần mở đầu (DustMotes của momi-ui): căn phòng hậu tận thế đầy bụi, đèn LED
// trắng ấm chiếu chéo từ góc trên bên phải (đèn bàn trong app nằm bên phải), luồng sáng quay theo con trỏ, rê chuột thì
// bụi bay tán ra. Island riêng vì phần thân trang không chạy JS; tự dừng khi khuất màn hình, đứng yên khi giảm chuyển động.
import { DustMotes } from 'momi-ui'

export default function HeroDust(): React.JSX.Element {
  return (
    <DustMotes
      aria-hidden
      color="#ffe1b0"
      beamColor="#ffd9a0"
      ambientColor="#7f9a9c"
      source={{ x: 0.86, y: -0.12 }}
      aim={{ x: 0.42, y: 0.95 }}
      spread={16}
      count={220}
    />
  )
}
