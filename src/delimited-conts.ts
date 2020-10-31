const op1 = {
    capture: true,
    next: op2
}
const op2 = {
    val: (val: number) => val * 2,
    next: op3
}


const op3 = {
    return: true,
    val: (k: typeof op2) => {
        return 17 + k(4)
    }
}
