import { Entity, EntityManager, PrimaryGeneratedColumn, Column } from "typeorm"
@Entity()
export class OperonHello {
    @PrimaryGeneratedColumn()
    greeting_id: number = 0

    @Column()
    greeting: string = "greeting"

} 